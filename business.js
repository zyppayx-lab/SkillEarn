// business.js
// FINAL PRODUCTION VERSION

console.log("🔥 BUSINESS ROUTES LOADED");

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
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


function businessOnly(req,res,next){

    if(
        req.user.role !== "vendor" &&
        req.user.role !== "admin"
    ){

        return res
        .status(403)
        .json({
            message:"Business only"
        });

    }

    next();

}


/* ==========================================
HELPERS
========================================== */
function isNigeria(country){

    return country === "NG";

}


function ngnToUsd(ngn){

    return Number(
        (ngn / 1600)
        .toFixed(3)
    );

}


function usdToNgn(usd){

    return Number(
        (usd * 1600)
        .toFixed(2)
    );

}


function socialReward(country){

    if(
        isNigeria(country)
    ){

        return {
            currency:"NGN",
            amount:50,
            usd:0.036
        };

    }

    return {
        currency:"USD",
        amount:0.036,
        ngn:50
    };

}


async function sendEmail(
    email,
    subject,
    html
){

    try{

        await resend
        .emails
        .send({

            from:
            process.env.FROM_EMAIL,

            to:email,

            subject,

            html

        });

    }catch(err){

        console.error(
            "EMAIL ERROR:",
            err.message
        );

    }

}


async function sendOTP(
    email,
    otp
){

    await sendEmail(

        email,

        "Verify your Business Account",

        `
        <h2>SkillEarn</h2>
        <h1>${otp}</h1>
        <p>Expires in 10 mins</p>
        `

    );

}


/* ==========================================
REGISTER
========================================== */
router.post(
"/api/business/register",
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        const {
            business_name,
            email,
            password,
            country
        } = req.body;


        if(
            !business_name ||
            !email ||
            !password
        ){

            return res
            .status(400)
            .json({
                message:"Missing fields"
            });

        }


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
            exists.rows.length
        ){

            return res
            .status(400)
            .json({
                message:"Email already exists"
            });

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


        await pool.query(

            `
            INSERT INTO vendors
            (
                business_name,
                email,
                password,
                country,
                approved,
                email_verified,
                otp_code,
                otp_expires
            )
            VALUES
            (
                $1,$2,$3,$4,
                false,
                false,
                $5,
                NOW()+INTERVAL '10 minutes'
            )
            `,

            [
                business_name,
                email,
                hash,
                country || "NG",
                otp
            ]

        );


        await sendOTP(
            email,
            otp
        );


        res.json({
            message:"OTP sent"
        });


    }catch(err){

        res
        .status(500)
        .json({
            message:err.message
        });

    }

});

/* ==========================================
APPROVE FREELANCE
========================================== */

router.post(
"/api/business/approve-freelance",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        await pool.query(

            `
            UPDATE freelance_applications
            SET status='APPROVED'
            WHERE
            id=$1
            AND vendor_id=$2
            `,

            [
                req.body.application_id,
                req.user.id
            ]

        );

        res.json({
            message:"Freelance approved"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});


/* ==========================================
HIRING APPROVAL
========================================== */
router.post(
"/api/business/approve-hiring",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        await pool.query(

            `
            UPDATE hiring_applications
            SET status='APPROVED'
            WHERE
            id=$1
            AND vendor_id=$2
            `,

            [
                req.body.application_id,
                req.user.id
            ]

        );

        res.json({
            message:"Hiring approved"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});


/* ==========================================
APPROVE INFLUENCE
========================================== */
 router.post(
"/api/business/approve-influencer",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;

        await pool.query(

            `
            UPDATE influencer_applications
            SET status='APPROVED'
            WHERE
            id=$1
            AND vendor_id=$2
            `,

            [
                req.body.application_id,
                req.user.id
            ]

        );

        res.json({
            message:"Influencer approved"
        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

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
                "Invalid or expired OTP"
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
            "Email verified. Await admin approval."

        });


    }catch(err){

        res
        .status(500)
        .json({
            message:err.message
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

            return res
            .status(400)
            .json({
                message:"Invalid login"
            });

        }


        const vendor =
        result.rows[0];


        const valid =
        await bcrypt.compare(
            password,
            vendor.password
        );


        if(!valid){

            return res
            .status(400)
            .json({
                message:"Invalid login"
            });

        }


        if(
            !vendor.email_verified
        ){

            return res
            .status(403)
            .json({
                message:
                "Verify email first"
            });

        }


        if(
            !vendor.approved
        ){

            return res
            .status(403)
            .json({
                message:
                "Await admin approval"
            });

        }


        const token =
        jwt.sign(

            {

                id:vendor.id,
                email:vendor.email,
                role:"vendor",
                country:vendor.country

            },

            process.env.JWT_SECRET,

            {
                expiresIn:"7d"
            }

        );


        res.json({

    message:
    "Login successful",

    token,

    vendor:{

        id:vendor.id,

        business_name:
        vendor.business_name,

        email:
        vendor.email,

        country:
        vendor.country

    }

});


    }catch(err){

        res
        .status(500)
        .json({
            message:err.message
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


        const result =
        await pool.query(

            `
            SELECT id
            FROM vendors
            WHERE email=$1
            `,

            [email]

        );


        if(
            !result.rows.length
        ){

            return res.json({
                message:"OTP sent"
            });

        }


        const otp =
        Math.floor(
            100000 +
            Math.random()*900000
        ).toString();




        await pool.query(

            `
            UPDATE vendors
            SET
            reset_otp=$1,
            reset_otp_expires=
            NOW()+INTERVAL '10 minutes'
            WHERE email=$2
            `,

            [
                otp,
                email
            ]

        );




        await sendEmail(

            email,

            "Reset Password",

            `
            <h2>SkillEarn</h2>
            <p>Password reset code:</p>
            <h1>${otp}</h1>
            `

        );




        res.json({
            message:"OTP sent"
        });


    }catch(err){

        res
        .status(500)
        .json({
            message:err.message
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
            AND reset_otp=$2
            AND reset_otp_expires > NOW()
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
                "Invalid or expired OTP"
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
            reset_otp=NULL,
            reset_otp_expires=NULL
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
            message:err.message
        });

    }

});

/* ==========================================
DASHBOARD
========================================== */
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


        const payments =
        await pool.query(

            `
            SELECT
            COALESCE(
                SUM(escrow_amount),
                0
            ) AS escrow,

            COALESCE(
                SUM(amount),
                0
            ) AS total_spent

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


        res.json({

            escrow:
            Number(
                payments.rows[0]
                .escrow
            ),

            total_spent:
            Number(
                payments.rows[0]
                .total_spent
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
            )

        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});


/* ==========================================
PAYMENTS
========================================== */
router.get(
"/api/business/payments",
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
            FROM payments
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
NOTIFICATIONS
========================================== */
router.get(
"/api/business/notifications",
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
            FROM notifications
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
SUBMISSIONS
========================================== */
router.get(
"/api/business/submissions",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;


        const result =
        await pool.query(

            `
            SELECT

            s.id,
            s.status,
            s.proof,
            s.created_at,

            u.name AS user_name,

            COALESCE(

                st.title,

                f.title,

                h.title,

                i.title

            ) AS task_title

            FROM submissions s

            JOIN users u
            ON u.id=s.user_id


            LEFT JOIN social_tasks st
            ON st.id=s.task_id


            LEFT JOIN freelance_jobs f
            ON f.id=s.task_id


            LEFT JOIN hiring_jobs h
            ON h.id=s.task_id


            LEFT JOIN influencer_jobs i
            ON i.id=s.task_id


            WHERE

            st.vendor_id=$1

            OR f.vendor_id=$1

            OR h.vendor_id=$1

            OR i.vendor_id=$1


            ORDER BY s.id DESC
            `,

            [

                req.user.id

            ]

        );


        res.json(
            result.rows
        );

    }catch(err){

        res.status(500).json({

            message:
            err.message

        });

    }

});


/* ==========================================
ANALYTICS
========================================== */
router.get(
"/api/business/analytics",
auth,
businessOnly,
async(req,res)=>{

    try{

        const pool =
        req.app.locals.pool;


        const vendorId =
        req.user.id;


        const result =
        await pool.query(

            `
            SELECT
            COALESCE(
                SUM(amount),
                0
            ) AS total_spent,

            COUNT(*) AS payments

            FROM payments
            WHERE vendor_id=$1
            `,

            [vendorId]

        );


        res.json({

            total_spent:
            Number(
                result.rows[0]
                .total_spent
            ),

            payments:
            Number(
                result.rows[0]
                .payments
            )

        });

    }catch(err){

        res.status(500).json({
            message:err.message
        });

    }

});

/* ==========================================
PRICING
========================================== */
router.get(
"/api/business/pricing",
auth,
businessOnly,
async(req,res)=>{

    const country =
    req.user.country;


    res.json({

        social:
        socialReward(country),

        freelance:{

            min:
            isNigeria(country)
            ? usdToNgn(4)
            : 4,

            max:
            isNigeria(country)
            ? usdToNgn(100)
            : 100

        },

        influencer:{

            min:
            isNigeria(country)
            ? usdToNgn(10)
            : 10,

            max:
            isNigeria(country)
            ? usdToNgn(50)
            : 50

        },

        hiring:

        isNigeria(country)
        ? 2000
        : ngnToUsd(2000)

    });

});


/* ==========================================
CREATE CAMPAIGN
========================================== */
router.post(
"/api/business/create-campaign",
auth,
businessOnly,
async(req,res)=>{

    try{

        const {
            purpose,
            category,
            title,
            description,
            link,
            qty
        } = req.body;


        if(
            !purpose ||
            !category ||
            !title
        ){

            return res
            .status(400)
            .json({
                message:"Missing fields"
            });

        }


        if(
            purpose === "social" &&
            !link
        ){

            return res
            .status(400)
            .json({
                message:
                "Campaign link required"
            });

        }


        const workers =
        Number(
            qty || 1
        );


        if(
            workers < 1
        ){

            return res
            .status(400)
            .json({
                message:
                "Invalid quantity"
            });

        }


        res.json({

            message:
            "Proceed to payment",

            payment_payload:{

                purpose,
                category,
                title,

                description:
                description || "",

                link:
                link || "",

                qty:
                workers

            }

        });


    }catch(err){

        res
        .status(500)
        .json({
            message:err.message
        });

    }

});


/* ==========================================
APPROVE SUBMISSION
========================================== */
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
                req.body
                .submission_id
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
            submission.status ===
            "APPROVED"
        ){

            throw new Error(
                "Already approved"
            );

        }


        const task =
        await client.query(

            `
            SELECT *
            FROM tasks
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

            message:
            "User paid successfully"

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

module.exports = router;
