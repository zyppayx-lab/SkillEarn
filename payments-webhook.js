// payments-webhook.js

const express = require("express");
const crypto = require("crypto");

const router = express.Router();



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

        const hash =

        crypto

        .createHmac(

            "sha512",

            process.env
            .PAYSTACK_SECRET_KEY

        )

        .update(
            req.body
        )

        .digest(
            "hex"
        );



        if(

            hash !==

            req.headers[
                "x-paystack-signature"
            ]

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



        await processPayment(

            req.app
            .locals
            .pool,

            event.data,

            event.data.metadata,

            "paystack"

        );



        res.end();



    }catch(err){

        console.error(
            "PAYSTACK WEBHOOK:",
            err
        );

        res
        .status(500)
        .end();

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

        if(

            req.body
            .payment_status !==
            "finished"

        ){

            return res.end();

        }



        const meta =

        JSON.parse(

            req.body
            .order_description

        );



        await processPayment(

            req.app
            .locals
            .pool,

            {

                reference:

                req.body
                .order_id,

                amount:

                req.body
                .price_amount

            },

            meta,

            "crypto"

        );



        res.end();



    }catch(err){

        console.error(
            "CRYPTO WEBHOOK:",
            err
        );

        res
        .status(500)
        .end();

    }

});




/* ==========================================
PROCESS PAYMENT
========================================== */
async function processPayment(
    pool,
    payment,
    meta,
    method
){

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );



        const duplicate =

        await client.query(

            `
            SELECT id
            FROM payments
            WHERE reference=$1
            `,

            [

                payment
                .reference

            ]

        );



        if(

            duplicate
            .rows
            .length

        ){

            await client.query(
                "ROLLBACK"
            );

            return;

        }



        if(

            !meta.vendor_id ||
            !meta.purpose ||
            !meta.title

        ){

            throw new Error(
                "Invalid payment metadata"
            );

        }



        const amount =

        method ===
        "paystack"

        ?

        Number(
            payment.amount
        ) / 100

        :

        Number(
            payment.amount
        );



        const escrow =
        amount * 0.1;



        /* SAVE PAYMENT */
        await client.query(

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

                meta.vendor_id,

                amount,

                escrow,

                amount-escrow,

                method,

                meta.purpose,

                payment.reference

            ]

        );



        /* UPDATE ESCROW */
        await client.query(

            `
            UPDATE businesses

            SET escrow =

            COALESCE(
                escrow,
                0
            ) + $1

            WHERE id = $2
            `,

            [

                escrow,

                meta.vendor_id

            ]

        );



        /* CREATE CAMPAIGN */
        await createCampaign(

            client,

            meta,

            payment.reference

        );



        await client.query(
            "COMMIT"
        );



    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        console.error(
            "PAYMENT PROCESS:",
            err
        );

        throw err;



    }finally{

        client.release();

    }

}




/* ==========================================
CREATE CAMPAIGN
========================================== */
async function createCampaign(
    db,
    meta,
    paymentRef
){

    try{



        /* SOCIAL */
        if(

            meta.purpose ===
            "social"

        ){

            await db.query(

                `
                INSERT INTO social_tasks
                (
                    vendor_id,
                    platform,
                    title,
                    description,
                    reward,
                    slots,
                    paid,
                    payment_reference,
                    status,
                    campaign_link
                )

                VALUES
                (
                    $1,$2,$3,$4,
                    50,
                    $5,
                    true,
                    $6,
                    'ACTIVE',
                    $7
                )
                `,

                [

                    meta.vendor_id,

                    meta.platform ||
                    meta.category,

                    meta.title,

                    meta.description || "",

                    Number(
                        meta.qty || 1
                    ),

                    paymentRef,

                    meta.link || ""

                ]

            );

        }



        /* FREELANCE */
        if(

            meta.purpose ===
            "freelance"

        ){

            await db.query(

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
                    $1,$2,$3,$4,
                    true,
                    $5,
                    'ACTIVE'
                )
                `,

                [

                    meta.vendor_id,

                    meta.title,

                    meta.description || "",

                    Number(
                        meta.category
                    ),

                    paymentRef

                ]

            );

        }



        /* HIRING */
        if(

            meta.purpose ===
            "hiring"

        ){

            await db.query(

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
                    $1,$2,$3,$4,
                    true,
                    $5,
                    'ACTIVE'
                )
                `,

                [

                    meta.vendor_id,

                    meta.title,

                    meta.description || "",

                    Number(
                        meta.category
                    ),

                    paymentRef

                ]

            );

        }



        /* INFLUENCER */
        if(

            meta.purpose ===
            "influencer"

        ){

            await db.query(

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
                    $1,$2,$3,$4,
                    true,
                    $5,
                    'ACTIVE'
                )
                `,

                [

                    meta.vendor_id,

                    meta.title,

                    meta.description || "",

                    Number(
                        meta.category
                    ),

                    paymentRef

                ]

            );

        }



        /* NOTIFICATION */
        await db.query(

            `
            INSERT INTO notifications
            (
                vendor_id,
                message
            )

            VALUES
            (
                $1,
                $2
            )
            `,

            [

                meta.vendor_id,

                "Payment successful. Campaign is live."

            ]

        );



    }catch(err){

        console.error(
            "CAMPAIGN INSERT:",
            err
        );

        throw err;

    }

}



module.exports = router;
