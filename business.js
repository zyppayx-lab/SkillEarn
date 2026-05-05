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

        isNigeria(country)
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
FORGOT PASSWORD
========================================== */
router.post(
"/api/business/forgot-password",
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            email
        } = req.body;


        const exists =
        await pool.query(

            `
            SELECT id
            FROM vendors
            WHERE email=$1
            `,

            [email]

        );


        if(
            !exists.rows.length
        ){

            return res
            .status(404)
            .json({

                message:
                "Email not found"

            });

        }


        const otp =
        Math.floor(

            100000 +

            Math.random() *

            900000

        ).toString();


        await pool.query(

            `
            UPDATE vendors
            SET
            otp_code=$1,
            otp_expires=
            NOW()+INTERVAL
            '10 minutes'
            WHERE email=$2
            `,

            [
                otp,
                email
            ]

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

        res
        .status(500)
        .json({

            message:
            err.message

        });

    }

});


/* ==========================================
RESET PASSWORD
========================================== */
router.post(
"/api/business/reset-password",
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {

            email,
            otp,
            password

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


        const hash =
        await bcrypt.hash(

            password,

            10

        );


        await pool.query(

            `
            UPDATE vendors
            SET

            password=$1,

            otp_code=NULL,

            otp_expires=NULL

            WHERE email=$2
            `,

            [
                hash,
                email
            ]

        );


        res.json({

            message:
            "Password updated"

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

router.get(
"/api/business/dashboard",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const vendorId =
        req.user.id;


        const wallet =
        await pool.query(

            `
            SELECT
            balance,
            currency
            FROM business_wallets
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const funded =
        await pool.query(

            `
            SELECT
            COALESCE(
                SUM(amount),
                0
            ) AS total
            FROM business_transactions
            WHERE
            vendor_id=$1
            AND type='FUND'
            `,

            [vendorId]

        );


        const spent =
        await pool.query(

            `
            SELECT
            COALESCE(
                SUM(amount),
                0
            ) AS total
            FROM payments
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const social =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM social_tasks
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const freelance =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM freelance_jobs
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const hiring =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM hiring_jobs
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const influencer =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM influencer_jobs
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        const pending =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM submissions s
            JOIN social_tasks t
            ON t.id=s.task_id
            WHERE
            t.vendor_id=$1
            AND s.status='PENDING'
            `,

            [vendorId]

        );


        const approved =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM submissions s
            JOIN social_tasks t
            ON t.id=s.task_id
            WHERE
            t.vendor_id=$1
            AND s.status='APPROVED'
            `,

            [vendorId]

        );


        const rejected =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM submissions s
            JOIN social_tasks t
            ON t.id=s.task_id
            WHERE
            t.vendor_id=$1
            AND s.status='REJECTED'
            `,

            [vendorId]

        );


        const notifications =
        await pool.query(

            `
            SELECT COUNT(*)
            FROM notifications
            WHERE
            vendor_id=$1
            AND is_read=false
            `,

            [vendorId]

        );


        res.json({

            wallet:
            wallet.rows[0],

            total_funded:
            Number(
                funded.rows[0]
                .total
            ),

            total_spent:
            Number(
                spent.rows[0]
                .total
            ),

            social_tasks:
            Number(
                social.rows[0]
                .count
            ),

            freelance_jobs:
            Number(
                freelance.rows[0]
                .count
            ),

            hiring_jobs:
            Number(
                hiring.rows[0]
                .count
            ),

            influencer_jobs:
            Number(
                influencer.rows[0]
                .count
            ),

            pending_reviews:
            Number(
                pending.rows[0]
                .count
            ),

            approved_reviews:
            Number(
                approved.rows[0]
                .count
            ),

            rejected_reviews:
            Number(
                rejected.rows[0]
                .count
            ),

            unread_notifications:
            Number(
                notifications.rows[0]
                .count
            )

        });

    }catch(err){

        res.status(500).json({

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
        
        if(
    req.user.country !==
    "NG"
){

    return res
    .status(403)
    .json({

        message:
        "Use crypto funding"

    });

        }

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

        if(
    req.user.country ===
    "NG"
){

    return res
    .status(403)
    .json({

        message:
        "Use Paystack"

    });

        }

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

router.get(
"/api/business/pricing",
auth,
businessOnly,
async(req,res)=>{

    const country =
    req.user.country;


    res.json({

        social:{
            amount:
            localPrice(
                PRICING.SOCIAL_PER_USER,
                country
            )
        },

        freelance:{
            min:
            localPrice(
                PRICING.FREELANCE_MIN,
                country
            )
        },

        hiring:
        localPrice(
            PRICING.HIRING_FIXED,
            country
        ),

        influencer:{
            min:
            localPrice(
                PRICING.INFLUENCER_MIN,
                country
            )
        }

    });

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


        /* VALIDATION */

        if(

            !title?.trim() ||

            !description?.trim() ||

            !link?.trim() ||

            !qty ||

            Number(qty) < 1

        ){

            throw new Error(
                "Missing fields"
            );

        }


        const reward =
        Number(

            localPrice(

                PRICING
                .SOCIAL_PER_USER,

                req.user.country

            )

        );


        const total =
        reward *
        Number(qty);


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
            !wallet.rows.length
        ){

            throw new Error(
                "Wallet not found"
            );

        }


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

                title.trim(),

                description.trim(),

                link.trim(),

                reward,

                Number(qty)

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

            message:
            "Task created"

        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );


        res.status(400).json({

            message:
            err.message

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
            SELECT

            s.*,

            t.vendor_id,

            t.reward,

            t.title

            FROM submissions s

            JOIN social_tasks t
            ON t.id=s.task_id

            WHERE s.id=$1

            FOR UPDATE
            `,

            [
                req.body.submission_id
            ]

        );


        if(
            !sub.rows.length
        ){

            throw new Error(
                "Submission not found"
            );

        }


        const submission =
        sub.rows[0];


        if(

            submission.vendor_id !==
            req.user.id

        ){

            throw new Error(
                "Unauthorized"
            );

        }


        if(

            submission.status !==
            "PENDING"

        ){

            throw new Error(
                "Already reviewed"
            );

        }


        const reward =
        Number(
            submission.reward
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


        /* PAY USER */

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


        /* DEDUCT ESCROW */

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


        /* APPROVE */

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


        /* TRANSACTION */

        await client.query(

            `
            INSERT INTO
            transactions
            (
                user_id,
                amount,
                type,
                reference
            )
            VALUES
            (
                $1,$2,
                'TASK_EARNING',
                $3
            )
            `,

            [

                submission.user_id,

                reward,

                "TASK_" +
                submission.task_id

            ]

        );


        /* NOTIFICATION */

        await client.query(

            `
            INSERT INTO
            notifications
            (
                user_id,
                message
            )
            VALUES
            (
                $1,$2
            )
            `,

            [

                submission.user_id,

                "Your proof for " +
                submission.title +
                " was approved"

            ]

        );


        await client.query(
            "COMMIT"
        );


        res.json({

            message:
            "Approved"

        });


    }catch(err){

        await client.query(
            "ROLLBACK"
        );

        res
        .status(400)
        .json({
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


    const sub =
    await pool.query(

        `
        SELECT

        s.*,

        t.vendor_id,

        t.title

        FROM submissions s

        JOIN social_tasks t
        ON t.id=s.task_id

        WHERE s.id=$1
        `,

        [
            req.body.submission_id
        ]

    );


    if(
        !sub.rows.length
    ){

        return res
        .status(404)
        .json({
            message:
            "Not found"
        });

    }


    const submission =
    sub.rows[0];


    if(

        submission.vendor_id !==
        req.user.id

    ){

        return res
        .status(403)
        .json({
            message:
            "Unauthorized"
        });

    }


    if(

        submission.status !==
        "PENDING"

    ){

        return res
        .status(400)
        .json({
            message:
            "Already reviewed"
        });

    }


    await pool.query(

        `
        UPDATE submissions
        SET status='REJECTED'
        WHERE id=$1
        `,

        [

            submission.id

        ]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            submission.user_id,

            "Your proof for " +
            submission.title +
            " was rejected"

        ]

    );


    res.json({

        message:
        "Rejected"

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


        const title =
        String(
            req.body.title || ""
        ).trim();


        const description =
        String(
            req.body.description || ""
        ).trim();


        const budget =
        Number(
            req.body.budget
        );


        /* required fields */
        if(
            !title ||
            !description ||
            !budget
        ){

            throw new Error(
                "Please complete all fields"
            );

        }


        /* number validation */
        if(

            !Number.isFinite(
                budget
            ) ||

            budget <= 0

        ){

            throw new Error(
                "Invalid budget"
            );

        }


        /* minimum pricing */
        const minBudget =
        localPrice(

            PRICING
            .FREELANCE_MIN,

            req.user.country

        );


        if(
            budget < minBudget
        ){

            throw new Error(
                "Budget below minimum"
            );

        }


        /* wallet lock */
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


        /* wallet must exist */
        if(
            !wallet.rows.length
        ){

            throw new Error(
                "Wallet not found"
            );

        }


        const balance =
        Number(
            wallet.rows[0]
            .balance
        );


        if(
            balance < budget
        ){

            throw new Error(
                "Insufficient wallet"
            );

        }


        /* deduct */
        await client.query(

            `
            UPDATE
            business_wallets
            SET balance=
            balance-$1
            WHERE vendor_id=$2
            `,

            [
                budget,
                req.user.id
            ]

        );


        /* create job */
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

            message:
            "Freelance created"

        });

    }catch(err){

        await client.query(
            "ROLLBACK"
        );


        const safeMessages = {

            "Please complete all fields":
            "Please complete all fields",

            "Invalid budget":
            "Enter valid budget",

            "Budget below minimum":
            "Budget below minimum",

            "Wallet not found":
            "Wallet not found",

            "Insufficient wallet":
            "Insufficient wallet"

        };


        res.status(400).json({

            message:

            safeMessages[
                err.message
            ] ||

            "Could not create job"

        });

    }finally{

        client.release();

    }

});


router.post(
"/api/business/approve-freelance",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.vendor_id,

        j.title

        FROM
        freelance_applications a

        JOIN
        freelance_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    if(
        !app.rows.length
    ){

        return res
        .status(404)
        .json({
            message:"Not found"
        });

    }


    const row =
    app.rows[0];


    if(
        row.vendor_id !==
        req.user.id
    ){

        return res
        .status(403)
        .json({
            message:"Unauthorized"
        });

    }


    if(
        row.status !==
        "PENDING"
    ){

        return res
        .status(400)
        .json({
            message:"Already reviewed"
        });

    }


    await pool.query(

        `
        UPDATE
        freelance_applications
        SET status='APPROVED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your freelance proposal for " +
            row.title +
            " was approved"

        ]

    );


    res.json({
        message:"Approved"
    });

});      

router.post(
"/api/business/reject-freelance",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.vendor_id,

        j.title

        FROM
        freelance_applications a

        JOIN
        freelance_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    const row =
    app.rows[0];


    await pool.query(

        `
        UPDATE
        freelance_applications
        SET status='REJECTED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your freelance proposal for " +
            row.title +
            " was rejected"

        ]

    );


    res.json({
        message:"Rejected"
    });

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



        /* VALIDATION */

        if(

            !title ||
            !title.trim() ||

            !description ||
            !description.trim()

        ){

            throw new Error(
                "MISSING_FIELDS"
            );

        }



        const price =
        localPrice(

            PRICING
            .HIRING_FIXED,

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
            !wallet.rows.length
        ){

            throw new Error(
                "NO_WALLET"
            );

        }



        if(

            Number(

                wallet.rows[0]
                .balance

            ) < price

        ){

            throw new Error(
                "LOW_BALANCE"
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

                title.trim(),

                description.trim(),

                price

            ]

        );



        await client.query(
            "COMMIT"
        );



        res.json({

            message:
            "Hiring job created"

        });



    }catch(err){

        await client.query(
            "ROLLBACK"
        );



        const errors = {

            MISSING_FIELDS:
            "Complete all fields",

            NO_WALLET:
            "Wallet not found",

            LOW_BALANCE:
            "Insufficient wallet"

        };



        res.status(400).json({

            message:

            errors[
                err.message
            ] ||

            "Could not create hiring job"

        });



    }finally{

        client.release();

    }

});

router.post(
"/api/business/approve-hiring",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.vendor_id,

        j.title

        FROM
        hiring_applications a

        JOIN
        hiring_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    const row =
    app.rows[0];


    await pool.query(

        `
        UPDATE
        hiring_applications
        SET status='APPROVED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your CV for " +
            row.title +
            " was approved"

        ]

    );


    res.json({
        message:"Approved"
    });

});      

router.post(
"/api/business/reject-hiring",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.title

        FROM
        hiring_applications a

        JOIN
        hiring_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    const row =
    app.rows[0];


    await pool.query(

        `
        UPDATE
        hiring_applications
        SET status='REJECTED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your CV for " +
            row.title +
            " was rejected"

        ]

    );


    res.json({
        message:"Rejected"
    });

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



        /* VALIDATION */

        if(

            !title ||
            !title.trim() ||

            !description ||
            !description.trim() ||

            !budget ||
            Number(budget) <= 0

        ){

            throw new Error(
                "MISSING_FIELDS"
            );

        }



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
                "LOW_BUDGET"
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
            !wallet.rows.length
        ){

            throw new Error(
                "NO_WALLET"
            );

        }



        if(

            Number(

                wallet.rows[0]
                .balance

            ) < Number(budget)

        ){

            throw new Error(
                "LOW_BALANCE"
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

                title.trim(),

                description.trim(),

                budget

            ]

        );



        await client.query(
            "COMMIT"
        );



        res.json({

            message:
            "Influencer job created"

        });



    }catch(err){

        await client.query(
            "ROLLBACK"
        );



        const errors = {

            MISSING_FIELDS:
            "Complete all fields",

            LOW_BUDGET:
            "Budget below minimum",

            NO_WALLET:
            "Wallet not found",

            LOW_BALANCE:
            "Insufficient wallet"

        };



        res.status(400).json({

            message:

            errors[
                err.message
            ] ||

            "Could not create influencer job"

        });



    }finally{

        client.release();

    }

});

router.post(
"/api/business/approve-influencer",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.title

        FROM
        influencer_applications a

        JOIN
        influencer_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    const row =
    app.rows[0];


    await pool.query(

        `
        UPDATE
        influencer_applications
        SET status='APPROVED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your portfolio for " +
            row.title +
            " was approved"

        ]

    );


    res.json({
        message:"Approved"
    });

});

router.post(
"/api/business/reject-influencer",
auth,
businessOnly,
async(req,res)=>{

    const pool =
    req.app.locals.pool;


    const app =
    await pool.query(

        `
        SELECT

        a.*,

        j.title

        FROM
        influencer_applications a

        JOIN
        influencer_jobs j

        ON j.id=a.job_id

        WHERE a.id=$1
        `,

        [
            req.body.application_id
        ]

    );


    const row =
    app.rows[0];


    await pool.query(

        `
        UPDATE
        influencer_applications
        SET status='REJECTED'
        WHERE id=$1
        `,

        [row.id]

    );


    await pool.query(

        `
        INSERT INTO
        notifications
        (
            user_id,
            message
        )
        VALUES
        (
            $1,$2
        )
        `,

        [

            row.user_id,

            "Your portfolio for " +
            row.title +
            " was rejected"

        ]

    );


    res.json({
        message:"Rejected"
    });

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

module.exports = router;
