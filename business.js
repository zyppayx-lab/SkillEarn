// business.js
// FINAL PRODUCTION VERSION

console.log("🔥 BUSINESS ROUTES LOADED");

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const axios = require("axios");
const { Resend } = require("resend");

const router = express.Router();

const resend =
new Resend(
    process.env.RESEND_API_KEY
);


/* ==========================================
AUTH
========================================== */
function auth(req,res,next){

    const token =
    (req.headers.authorization || "")
    .replace("Bearer ","");

    try{

        req.user =
        jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        next();

    }catch{

        return res
        .status(401)
        .json({
            message:"Unauthorized"
        });

    }

}


function businessOnly(
    req,
    res,
    next
){

    if(
        req.user.role !==
        "vendor"
    ){

        return res
        .status(403)
        .json({
            message:
            "Business only"
        });

    }

    next();

}


/* ==========================================
EMAIL
========================================== */
async function sendOTP(
    email,
    otp
){

    await resend
    .emails
    .send({

        from:
        process.env.FROM_EMAIL,

        to:email,

        subject:
        "Verify Business",

        html:`
        <h2>SkillEarn</h2>
        <h1>${otp}</h1>
        <p>
        Expires in 10 mins
        </p>
        `

    });

}


/* ==========================================
REGISTER
========================================== */
router.post(
"/api/business/register",
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );


        const {
            business_name,
            email,
            password,
            country
        } = req.body;


        const exists =
        await client.query(

            `
            SELECT id
            FROM vendors
            WHERE email=$1
            `,

            [email]

        );


        if(
            exists.rows.length
        ){

            throw new Error(
                "Email exists"
            );

        }


        const hash =
        await bcrypt.hash(
            password,
            10
        );


        const otp =
        Math.floor(
            100000 +
            Math.random()*900000
        ).toString();


        const vendor =
        await client.query(

            `
            INSERT INTO vendors
            (
                business_name,
                email,
                password,
                country,
                role,
                approved,
                email_verified,
                otp_code,
                otp_expires
            )
            VALUES
            (
                $1,$2,$3,$4,
                'vendor',
                false,
                false,
                $5,
                NOW()+INTERVAL
                '10 minutes'
            )
            RETURNING id
            `,

            [

                business_name,
                email,
                hash,

                country || "NG",

                otp

            ]

        );


        const vendorId =
        vendor.rows[0].id;


        await client.query(

            `
            INSERT INTO
            business_wallets
            (
                vendor_id,
                balance,
                currency
            )
            VALUES
            (
                $1,
                0,
                $2
            )
            `,

            [

                vendorId,

                country ===
                "NG"
                ? "NGN"
                : "USD"

            ]

        );


        await client.query(
            "COMMIT"
        );


        await sendOTP(
            email,
            otp
        );


        res.json({

            message:
            "OTP sent"

        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res
        .status(400)
        .json({

            message:
            err.message

        });

    }finally{

        client.release();

    }

});


/* ==========================================
VERIFY EMAIL
========================================== */
router.post(
"/api/business/verify-email",
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            email,
            otp
        } = req.body;


        const result =
        await pool.query(

            `
            SELECT id
            FROM vendors
            WHERE
            email=$1
            AND otp_code=$2
            AND otp_expires > NOW()
            `,

            [
                email,
                otp
            ]

        );


        if(
            !result.rows.length
        ){

            return res
            .status(400)
            .json({

                message:
                "Invalid OTP"

            });

        }


        await pool.query(

            `
            UPDATE vendors
            SET
            email_verified=true,
            otp_code=NULL,
            otp_expires=NULL
            WHERE email=$1
            `,

            [email]

        );


        res.json({

            message:
            "Verified"

        });

    }catch(err){

        res
        .status(500)
        .json({

            message:
            err.message

        });

    }

});


/* ==========================================
LOGIN
========================================== */
router.post(
"/api/business/login",
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            email,
            password
        } = req.body;


        const result =
        await pool.query(

            `
            SELECT *
            FROM vendors
            WHERE email=$1
            `,

            [email]

        );


        if(
            !result.rows.length
        ){

            throw new Error(
                "Invalid login"
            );

        }


        const vendor =
        result.rows[0];


        const valid =
        await bcrypt.compare(

            password,

            vendor.password

        );


        if(!valid){

            throw new Error(
                "Invalid login"
            );

        }


        if(
            !vendor.approved
        ){

            throw new Error(
                "Await admin approval"
            );

        }


        const token =
        jwt.sign(

            {

                id:
                vendor.id,

                email:
                vendor.email,

                role:
                "vendor",

                country:
                vendor.country

            },

            process.env
            .JWT_SECRET,

            {

                expiresIn:
                "7d"

            }

        );


        res.json({

            token,

            vendor

        });

    }catch(err){

        res
        .status(400)
        .json({

            message:
            err.message

        });

    }

});


/* ==========================================
WALLET
========================================== */
router.get(
"/api/business/wallet",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const result =
    await pool.query(

        `
        SELECT *
        FROM business_wallets
        WHERE vendor_id=$1
        `,

        [req.user.id]

    );


    res.json(
        result.rows[0]
    );

});

module.exports =
router;

/* ==========================================
WALLET TRANSACTIONS
========================================== */
router.get(
"/api/business/transactions",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;


        const result =
        await pool.query(

            `
            SELECT *
            FROM business_transactions
            WHERE vendor_id=$1
            ORDER BY id DESC
            `,

            [req.user.id]

        );


        res.json(
            result.rows
        );

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});


/* ==========================================
FUND WALLET (PAYSTACK)
========================================== */
router.post(
"/api/business/fund-wallet/paystack",
auth,
businessOnly,
async(req,res)=>{

    try{

        const {
            amount
        } = req.body;


        if(
            !amount ||
            Number(amount) <= 0
        ){

            return res
            .status(400)
            .json({
                message:
                "Invalid amount"
            });

        }


        const reference =
        "BW_" +
        Date.now() +
        "_" +
        req.user.id;


        const paystack =
        await axios.post(

            "https://api.paystack.co/transaction/initialize",

            {

                email:
                req.user.email,

                amount:
                Number(amount) * 100,

                reference

            },

            {

                headers:{

                    Authorization:
                    `Bearer ${process.env.PAYSTACK_SECRET_KEY}`

                }

            }

        );


        res.json({

            reference,

            authorization_url:

            paystack
            .data
            .data
            .authorization_url

        });

    }catch(err){

        res.status(500).json({

            message:
            err.message

        });

    }

});


/* ==========================================
PAYSTACK WEBHOOK
========================================== */
router.post(
"/api/business/paystack/webhook",

express.raw({
    type:"application/json"
}),

async(req,res)=>{

    const signature =
    req.headers[
        "x-paystack-signature"
    ];


    const hash =
    crypto
    .createHmac(

        "sha512",

        process.env
        .PAYSTACK_SECRET_KEY

    )
    .update(req.body)
    .digest("hex");


    if(
        hash !== signature
    ){

        return res
        .status(401)
        .end();

    }


    const event =
    JSON.parse(
        req.body.toString()
    );


    if(
        event.event !==
        "charge.success"
    ){

        return res
        .sendStatus(200);

    }


    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        const reference =
        event.data.reference;


        const amount =
        Number(
            event.data.amount
        ) / 100;


        const vendorId =
        Number(

            reference
            .split("_")[2]

        );


        const exists =
        await client.query(

            `
            SELECT id
            FROM business_transactions
            WHERE reference=$1
            `,

            [reference]

        );


        if(
            exists.rows.length
        ){

            client.release();

            return res
            .sendStatus(200);

        }


        await client.query(
            "BEGIN"
        );


        await client.query(

            `
            UPDATE
            business_wallets
            SET balance=
            balance+$1
            WHERE vendor_id=$2
            `,

            [
                amount,
                vendorId
            ]

        );


        await client.query(

            `
            INSERT INTO
            business_transactions
            (
                vendor_id,
                amount,
                type,
                method,
                reference,
                status
            )
            VALUES
            (
                $1,$2,
                'FUND',
                'PAYSTACK',
                $3,
                'SUCCESS'
            )
            `,

            [

                vendorId,
                amount,
                reference

            ]

        );


        await client.query(
            "COMMIT"
        );


        res.sendStatus(200);

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.sendStatus(500);

    }finally{

        client.release();

    }

});


/* ==========================================
FUND WALLET (CRYPTO)
========================================== */
router.post(
"/api/business/fund-wallet/crypto",
auth,
businessOnly,
async(req,res)=>{

    try{

        const {
            amount,
            coin
        } = req.body;


        const reference =
        "BC_" +
        Date.now() +
        "_" +
        req.user.id;


        const payment =
        await axios.post(

            "https://api.nowpayments.io/v1/payment",

            {

                price_amount:
                amount,

                price_currency:
                "usd",

                pay_currency:
                coin.toLowerCase(),

                order_id:
                reference

            },

            {

                headers:{

                    "x-api-key":

                    process.env
                    .NOWPAYMENTS_API_KEY

                }

            }

        );


        res.json({

            reference,

            wallet_address:

            payment.data
            .pay_address,

            amount:

            payment.data
            .pay_amount,

            coin:

            payment.data
            .pay_currency

        });

    }catch(err){

        res.status(500).json({
            message:
            err.message
        });

    }

});

/* ==========================================
PRICING
========================================== */

function isNigeria(country){
    return country === "NG";
}

function ngnToUsd(ngn){
    return Number(
        (ngn / 1600).toFixed(2)
    );
}

const PRICING = {

    SOCIAL_PER_USER:50,

    FREELANCE_MIN:2000,

    HIRING_FIXED:2000,

    INFLUENCER_MIN:10000

};


function localPrice(
    amount,
    country
){

    if(isNigeria(country)){
        return amount;
    }

    return ngnToUsd(
        amount
    );

        }

router.post(
"/api/business/crypto/webhook",
express.json(),
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        const event =
        req.body;

        if(
            event.payment_status !==
            "finished"
        ){

            return res
            .sendStatus(200);

        }

        const reference =
        event.order_id;

        const vendorId =
        Number(
            reference
            .split("_")[2]
        );

        const amount =
        Number(
            event.price_amount
        );

        await client.query(
            "BEGIN"
        );

        const exists =
        await client.query(

            `
            SELECT id
            FROM business_transactions
            WHERE reference=$1
            `,

            [reference]

        );

        if(
            exists.rows.length
        ){

            await client.query(
                "ROLLBACK"
            );

            return res
            .sendStatus(200);

        }

        await client.query(

            `
            UPDATE business_wallets
            SET balance=
            balance+$1
            WHERE vendor_id=$2
            `,

            [
                amount,
                vendorId
            ]

        );

        await client.query(

            `
            INSERT INTO
            business_transactions
            (
                vendor_id,
                amount,
                type,
                method,
                reference,
                status
            )
            VALUES
            (
                $1,$2,
                'FUND',
                'CRYPTO',
                $3,
                'SUCCESS'
            )
            `,

            [
                vendorId,
                amount,
                reference
            ]

        );

        await client.query(
            "COMMIT"
        );

        res.sendStatus(200);

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.sendStatus(500);

    }finally{

        client.release();

    }

});

router.post(
"/api/business/create-social-task",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );

        const {

            title,
            description,
            link,
            qty

        } = req.body;


        const reward =
        localPrice(

            PRICING
            .SOCIAL_PER_USER,

            req.user.country

        );


        const total =
        reward * qty;


        const wallet =
        await client.query(

            `
            SELECT *
            FROM business_wallets
            WHERE vendor_id=$1
            FOR UPDATE
            `,

            [req.user.id]

        );


        if(

            Number(
                wallet.rows[0]
                .balance
            ) < total

        ){

            throw new Error(
                "Insufficient wallet"
            );

        }


        await client.query(

            `
            UPDATE business_wallets
            SET balance=
            balance-$1
            WHERE vendor_id=$2
            `,

            [
                total,
                req.user.id
            ]

        );


        const task =
        await client.query(

            `
            INSERT INTO social_tasks
            (
                vendor_id,
                title,
                description,
                link,
                reward,
                qty,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,
                $5,$6,
                'ACTIVE'
            )
            RETURNING id
            `,

            [

                req.user.id,

                title,

                description,

                link,

                reward,

                qty

            ]

        );


        await client.query(

            `
            INSERT INTO escrow
            (
                task_id,
                remaining_amount
            )
            VALUES
            (
                $1,$2
            )
            `,

            [

                task.rows[0].id,

                total

            ]

        );


        await client.query(
            "COMMIT"
        );

        res.json({
            message:"Task created"
        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.status(400).json({
            message:err.message
        });

    }finally{

        client.release();

    }

});

router.post(
"/api/business/approve-submission",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );

        const sub =
        await client.query(

            `
            SELECT *
            FROM submissions
            WHERE id=$1
            FOR UPDATE
            `,

            [
                req.body.submission_id
            ]

        );


        const submission =
        sub.rows[0];


        const task =
        await client.query(

            `
            SELECT *
            FROM social_tasks
            WHERE id=$1
            `,

            [
                submission.task_id
            ]

        );


        const reward =
        Number(
            task.rows[0]
            .reward
        );


        const esc =
        await client.query(

            `
            SELECT *
            FROM escrow
            WHERE task_id=$1
            FOR UPDATE
            `,

            [
                submission.task_id
            ]

        );


        if(

            Number(
                esc.rows[0]
                .remaining_amount
            ) < reward

        ){

            throw new Error(
                "Escrow empty"
            );

        }


        await client.query(

            `
            UPDATE users
            SET balance=
            balance+$1
            WHERE id=$2
            `,

            [
                reward,
                submission.user_id
            ]

        );


        await client.query(

            `
            UPDATE escrow
            SET remaining_amount=
            remaining_amount-$1
            WHERE task_id=$2
            `,

            [
                reward,
                submission.task_id
            ]

        );


        await client.query(

            `
            UPDATE submissions
            SET status='APPROVED'
            WHERE id=$1
            `,

            [
                submission.id
            ]

        );


        await client.query(
            "COMMIT"
        );

        res.json({
            message:"Approved"
        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.status(400).json({
            message:err.message
        });

    }finally{

        client.release();

    }

});

router.post(
"/api/business/reject-submission",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    await pool.query(

        `
        UPDATE submissions
        SET status='REJECTED'
        WHERE id=$1
        `,

        [
            req.body.submission_id
        ]

    );

    res.json({
        message:"Rejected"
    });

});

router.post(
"/api/business/create-freelance",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );

        const {

            title,
            description,
            budget

        } = req.body;


        const minBudget =
        localPrice(
            PRICING.FREELANCE_MIN,
            req.user.country
        );


        if(
            Number(budget) <
            minBudget
        ){

            throw new Error(
                "Below minimum"
            );

        }


        const wallet =
        await client.query(

            `
            SELECT *
            FROM business_wallets
            WHERE vendor_id=$1
            FOR UPDATE
            `,

            [req.user.id]

        );


        if(

            Number(
                wallet.rows[0]
                .balance
            ) < budget

        ){

            throw new Error(
                "Insufficient wallet"
            );

        }


        await client.query(

            `
            UPDATE business_wallets
            SET balance=
            balance-$1
            WHERE vendor_id=$2
            `,

            [
                budget,
                req.user.id
            ]

        );


        await client.query(

            `
            INSERT INTO
            freelance_jobs
            (
                vendor_id,
                title,
                description,
                budget,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,
                'ACTIVE'
            )
            `,

            [

                req.user.id,

                title,

                description,

                budget

            ]

        );


        await client.query(
            "COMMIT"
        );

        res.json({
            message:"Freelance created"
        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.status(400).json({
            message:err.message
        });

    }finally{

        client.release();

    }

});

router.post(
"/api/business/create-hiring",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );

        const {

            title,
            description

        } = req.body;


        const price =
        localPrice(
            PRICING.HIRING_FIXED,
            req.user.country
        );


        const wallet =
        await client.query(

            `
            SELECT *
            FROM business_wallets
            WHERE vendor_id=$1
            FOR UPDATE
            `,

            [req.user.id]

        );


        if(

            Number(
                wallet.rows[0]
                .balance
            ) < price

        ){

            throw new Error(
                "Insufficient wallet"
            );

        }


        await client.query(

            `
            UPDATE business_wallets
            SET balance=
            balance-$1
            WHERE vendor_id=$2
            `,

            [
                price,
                req.user.id
            ]

        );


        await client.query(

            `
            INSERT INTO
            hiring_jobs
            (
                vendor_id,
                title,
                description,
                budget,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,
                'ACTIVE'
            )
            `,

            [

                req.user.id,

                title,

                description,

                price

            ]

        );


        await client.query(
            "COMMIT"
        );

        res.json({
            message:"Hiring created"
        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.status(400).json({
            message:err.message
        });

    }finally{

        client.release();

    }

});

router.post(
"/api/business/create-influencer",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;

    const client =
    await pool.connect();

    try{

        await client.query(
            "BEGIN"
        );

        const {

            title,
            description,
            budget

        } = req.body;


        const minBudget =
        localPrice(
            PRICING
            .INFLUENCER_MIN,
            req.user.country
        );


        if(
            Number(budget) <
            minBudget
        ){

            throw new Error(
                "Below minimum"
            );

        }


        const wallet =
        await client.query(

            `
            SELECT *
            FROM business_wallets
            WHERE vendor_id=$1
            FOR UPDATE
            `,

            [req.user.id]

        );


        if(

            Number(
                wallet.rows[0]
                .balance
            ) < budget

        ){

            throw new Error(
                "Insufficient wallet"
            );

        }


        await client.query(

            `
            UPDATE business_wallets
            SET balance=
            balance-$1
            WHERE vendor_id=$2
            `,

            [
                budget,
                req.user.id
            ]

        );


        await client.query(

            `
            INSERT INTO
            influencer_jobs
            (
                vendor_id,
                title,
                description,
                budget,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,
                'ACTIVE'
            )
            `,

            [

                req.user.id,

                title,

                description,

                budget

            ]

        );


        await client.query(
            "COMMIT"
        );

        res.json({
            message:"Influencer created"
        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res.status(400).json({
            message:err.message
        });

    }finally{

        client.release();

    }

});

router.get(
"/api/business/applications",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const freelance =
    await pool.query(

        `
        SELECT *
        FROM freelance_applications
        WHERE vendor_id=$1
        ORDER BY id DESC
        `,

        [req.user.id]

    );


    const hiring =
    await pool.query(

        `
        SELECT *
        FROM hiring_applications
        WHERE vendor_id=$1
        ORDER BY id DESC
        `,

        [req.user.id]

    );


    const influencer =
    await pool.query(

        `
        SELECT *
        FROM influencer_applications
        WHERE vendor_id=$1
        ORDER BY id DESC
        `,

        [req.user.id]

    );


    res.json({

        freelance:
        freelance.rows,

        hiring:
        hiring.rows,

        influencer:
        influencer.rows

    });

});
