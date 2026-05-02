// payments-webhook.js
// FINAL PRODUCTION VERSION

const express = require("express");
const crypto = require("crypto");

const router =
express.Router();


/* ==========================================
PAYSTACK WEBHOOK
========================================== */
router.post(

"/paystack",

express.raw({

    type:"application/json"

}),

async(req,res)=>{

    try{

        const secret =
        process.env
        .PAYSTACK_SECRET_KEY;


        const signature =
        req.headers[
            "x-paystack-signature"
        ];


        const hash =
        crypto

        .createHmac(

            "sha512",
            secret

        )

        .update(
            req.body
        )

        .digest(
            "hex"
        );


        if(
            hash !== signature
        ){

            return res
            .status(401)
            .end();

        }


        const event =
        JSON.parse(

            req.body
            .toString()

        );


        if(
            event.event !==
            "charge.success"
        ){

            return res.end();

        }


        await processPaystack(

            event.data,
            req

        );


        res.end();


    }catch(err){

        console.error(err);

        res
        .status(500)
        .end();

    }

});


/* ==========================================
PAYSTACK VERIFY
========================================== */
router.post(

"/paystack/verify",

express.json(),

async(req,res)=>{

    try{

        const reference =
        req.body.reference;


        const verify =
        await fetch(

            `https://api.paystack.co/transaction/verify/${reference}`,

            {

                headers:{

                    Authorization:

                    "Bearer " +

                    process.env
                    .PAYSTACK_SECRET_KEY

                }

            }

        );


        const data =
        await verify
        .json();


        if(

            !data.status ||

            data.data.status !==
            "success"

        ){

            return res
            .status(400)
            .json({

                message:
                "Verification failed"

            });

        }


        await processPaystack(

            data.data,
            req

        );


        res.json({

            message:
            "Payment verified"

        });


    }catch(err){

        console.error(err);

        res
        .status(500)
        .json({

            message:
            "Failed"

        });

    }

});


/* ==========================================
CRYPTO WEBHOOK
========================================== */
router.post(

"/crypto",

express.json(),

async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;


        const body =
        req.body;


        if(

            body.payment_status !==
            "finished"

        ){

            return res.end();

        }


        const reference =
        body.order_id;


        const duplicate =
        await pool.query(

            `
            SELECT id
            FROM payments
            WHERE reference=$1
            `,

            [reference]

        );


        if(
            duplicate.rows.length
        ){

            return res.end();

        }


        const meta =

        (
            body
            .order_description || ""
        )

        .split("|");


        const purpose =
        meta[0];


        const category =
        meta[1];


        const vendorId =
        Number(
            meta[2]
        );


        const title =
        meta[3];


        const description =
        meta[4];


        const amount =
        Number(
            body
            .price_amount
        );


        await savePayment(

            pool,

            {

                vendorId,

                purpose,

                amount,

                reference,

                method:"crypto"

            }

        );


        await createJob(

            pool,

            purpose,

            {

                vendor_id:
                vendorId,

                category,

                title,

                description,

                payment_ref:
                reference

            }

        );


        res.end();


    }catch(err){

        console.error(err);

        res
        .status(500)
        .end();

    }

});


/* ==========================================
PAYSTACK PROCESS
========================================== */
async function processPaystack(
    data,
    req
){

    const pool =
    req.app.locals.pool;


    const reference =
    data.reference;


    const duplicate =
    await pool.query(

        `
        SELECT id
        FROM payments
        WHERE reference=$1
        `,

        [reference]

    );


    if(
        duplicate.rows.length
    ){

        return;

    }


    const meta =
    data.metadata || {};


    const vendorId =
    Number(
        meta.vendor_id
    );


    const amount =
    Number(
        data.amount
    ) / 100;


    await savePayment(

        pool,

        {

            vendorId,

            purpose:
            meta.purpose,

            amount,

            reference,

            method:
            "paystack"

        }

    );


    await createJob(

        pool,

        meta.purpose,

        {

            vendor_id:
            vendorId,

            category:
            meta.category,

            title:
            meta.title,

            description:
            meta.description,

            payment_ref:
            reference

        }

    );

}


/* ==========================================
SAVE PAYMENT
========================================== */
async function savePayment(
    pool,
    data
){

    const vendor =
    await pool.query(

        `
        SELECT id
        FROM vendors
        WHERE id=$1
        `,

        [

            data
            .vendorId

        ]

    );


    if(
        !vendor.rows.length
    ){

        throw new Error(
            "Vendor not found"
        );

    }


    const escrow =
    data.amount * 0.1;


    const released =
    data.amount - escrow;


    await pool.query(

        `
        INSERT INTO payments
        (
            vendor_id,
            amount,
            escrow_amount,
            released_amount,
            method,
            purpose,
            reference,
            status
        )

        VALUES
        (
            $1,$2,$3,$4,
            $5,$6,$7,
            'SUCCESS'
        )
        `,

        [

            data.vendorId,

            data.amount,

            escrow,

            released,

            data.method,

            data.purpose,

            data.reference

        ]

    );

}


/* ==========================================
CREATE JOBS
========================================== */
async function createJob(
    pool,
    purpose,
    data
){

    /* TASK */
    if(
        purpose === "task"
    ){

        await pool.query(

            `
            INSERT INTO tasks
            (
                vendor_id,
                title,
                description,
                reward,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,$2,$3,
                50,
                true,
                $4,
                'ACTIVE'
            )
            `,

            [

                data.vendor_id,

                data.title,

                data.description,

                data.payment_ref

            ]

        );

    }


    /* SOCIAL */
    if(
        purpose === "social"
    ){

        await pool.query(

            `
            INSERT INTO social_tasks
            (
                vendor_id,
                platform,
                action,
                title,
                description,
                reward,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,
                'instagram',
                $2,
                $3,
                $4,
                50,
                true,
                $5,
                'ACTIVE'
            )
            `,

            [

                data.vendor_id,

                data.category,

                data.title,

                data.description,

                data.payment_ref

            ]

        );

    }


    /* FREELANCE */
    if(
        purpose === "freelance"
    ){

        await pool.query(

            `
            INSERT INTO freelance_jobs
            (
                vendor_id,
                title,
                description,
                budget,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,$2,$3,
                0,
                true,
                $4,
                'ACTIVE'
            )
            `,

            [

                data.vendor_id,

                data.title,

                data.description,

                data.payment_ref

            ]

        );

    }


    /* HIRING */
    if(
        purpose === "hiring"
    ){

        await pool.query(

            `
            INSERT INTO hiring_jobs
            (
                vendor_id,
                title,
                description,
                salary,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,$2,$3,
                'Negotiable',
                true,
                $4,
                'ACTIVE'
            )
            `,

            [

                data.vendor_id,

                data.title,

                data.description,

                data.payment_ref

            ]

        );

    }


    /* INFLUENCER */
    if(
        purpose === "influencer"
    ){

        await pool.query(

            `
            INSERT INTO influencer_jobs
            (
                vendor_id,
                title,
                description,
                budget,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,$2,$3,
                0,
                true,
                $4,
                'ACTIVE'
            )
            `,

            [

                data.vendor_id,

                data.title,

                data.description,

                data.payment_ref

            ]

        );

    }

}

module.exports = router;
