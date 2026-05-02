// payments-webhook.js
// FINAL PRODUCTION VERSION

const express = require("express");
const crypto = require("crypto");

const router =
express.Router();


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

        console.error(err);

        res
        .status(500)
        .end();

    }

});


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

        console.error(err);

        res
        .status(500)
        .end();

    }

});


async function processPayment(
    pool,
    payment,
    meta,
    method
){

    const duplicate =
    await pool.query(

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
        duplicate.rows.length
    ){
        return;
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

            meta.vendor_id,

            amount,

            escrow,

            amount-escrow,

            method,

            meta.purpose,

            payment.reference

        ]

    );


    await createCampaign(
        pool,
        meta,
        payment.reference
    );

}


async function createCampaign(
    pool,
    meta,
    paymentRef
){

    if(
        meta.purpose ===
        "social"
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
                campaign_link,
                reward,
                paid,
                payment_reference,
                status
            )

            VALUES
            (
                $1,$2,$3,$4,$5,
                50,true,$6,
                'ACTIVE'
            )
            `,

            [

                meta.vendor_id,

                meta.platform,

                meta.category,

                meta.title,

                meta.description,

                meta.link,

                paymentRef

            ]

        );

    }


    if(
        meta.purpose ===
        "task"
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
                50,true,$4,
                'ACTIVE'
            )
            `,

            [

                meta.vendor_id,

                meta.title,

                meta.description,

                paymentRef

            ]

        );

    }

}

module.exports = router;
