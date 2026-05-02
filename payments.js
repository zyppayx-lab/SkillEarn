// payments.js
// FINAL PRODUCTION VERSION

const express = require("express");
const jwt = require("jsonwebtoken");

let fetchFn;

try{
    fetchFn = fetch;
}catch{
    fetchFn = require("node-fetch");
}

const router = express.Router();


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


/* ==========================================
PRICING
========================================== */
function calcPrice(
    country,
    purpose,
    category,
    qty
){

    qty =
    Number(qty) || 1;


    if(
        purpose === "task" ||
        purpose === "social"
    ){

        if(
            isNigeria(country)
        ){

            return {
                currency:"NGN",
                amount:qty * 50
            };

        }


        return {

            currency:"USD",

            amount:Number(
                (qty * 0.036)
                .toFixed(3)
            )

        };

    }


    if(
        purpose === "hiring"
    ){

        if(
            isNigeria(country)
        ){

            return {
                currency:"NGN",
                amount:2000
            };

        }


        return {

            currency:"USD",

            amount:
            ngnToUsd(2000)

        };

    }


    if(
        purpose === "freelance"
    ){

        const amount =
        Number(category);


        if(
            amount < 4 ||
            amount > 100
        ){
            return null;
        }


        if(
            isNigeria(country)
        ){

            return {

                currency:"NGN",

                amount:
                usdToNgn(amount)

            };

        }


        return {
            currency:"USD",
            amount
        };

    }


    if(
        purpose === "influencer"
    ){

        const amount =
        Number(category);


        if(
            amount < 10 ||
            amount > 50
        ){
            return null;
        }


        if(
            isNigeria(country)
        ){

            return {

                currency:"NGN",

                amount:
                usdToNgn(amount)

            };

        }


        return {
            currency:"USD",
            amount
        };

    }


    return null;

}


/* ==========================================
PAYSTACK INIT
========================================== */
async function initPaystack(
    email,
    amount,
    ref,
    metadata
){

    const response =
    await fetchFn(

        "https://api.paystack.co/transaction/initialize",

        {

            method:"POST",

            headers:{

                Authorization:

                "Bearer " +

                process.env
                .PAYSTACK_SECRET_KEY,

                "Content-Type":
                "application/json"

            },

            body:
            JSON.stringify({

                email,

                amount:
                amount * 100,

                reference:
                ref,

                metadata

            })

        }

    );


    return await
    response.json();

}


/* ==========================================
PAYSTACK
========================================== */
router.post(
"/api/paystack/create-payment",
auth,
businessOnly,
async(req,res)=>{

    try{

        if(
            !isNigeria(
                req.user.country
            )
        ){

            return res
            .status(400)
            .json({
                message:
                "Use crypto"
            });

        }


        const pricing =
        calcPrice(

            req.user.country,

            req.body.purpose,

            req.body.category,

            req.body.qty

        );


        if(!pricing){

            return res
            .status(400)
            .json({
                message:
                "Invalid pricing"
            });

        }


        const ref =
        "PAY_" +
        Date.now();


        const metadata = {

            vendor_id:
            req.user.id,

            purpose:
            req.body.purpose,

            category:
            req.body.category,

            qty:
            req.body.qty,

            title:
            req.body.title,

            description:
            req.body.description,

            link:
            req.body.link,

            platform:
            req.body.platform

        };


        const data =
        await initPaystack(

            req.body.email,

            pricing.amount,

            ref,

            metadata

        );


        res.json({

            reference:
            ref,

            currency:
            pricing.currency,

            amount:
            pricing.amount,

            payment_url:

            data.data
            .authorization_url

        });


    }catch(err){

        console.error(err);

        res
        .status(500)
        .json({
            message:
            "Payment failed"
        });

    }

});


/* ==========================================
CRYPTO
========================================== */
router.post(
"/api/crypto/create-payment",
auth,
businessOnly,
async(req,res)=>{

    try{

        if(
            isNigeria(
                req.user.country
            )
        ){

            return res
            .status(400)
            .json({
                message:
                "Use Paystack"
            });

        }


        const pricing =
        calcPrice(

            req.user.country,

            req.body.purpose,

            req.body.category,

            req.body.qty

        );


        const ref =
        "CRYPTO_" +
        Date.now();


        const response =
        await fetchFn(

            "https://api.nowpayments.io/v1/payment",

            {

                method:"POST",

                headers:{

                    "x-api-key":

                    process.env
                    .CRYPTO_API_KEY,

                    "Content-Type":
                    "application/json"

                },

                body:
                JSON.stringify({

                    price_amount:
                    pricing.amount,

                    price_currency:
                    "usd",

                    pay_currency:

                    req.body
                    .pay_currency ||

                    "usdttrc20",

                    order_id:
                    ref,

                    order_description:

                    JSON.stringify({

                        vendor_id:
                        req.user.id,

                        purpose:
                        req.body.purpose,

                        category:
                        req.body.category,

                        qty:
                        req.body.qty,

                        title:
                        req.body.title,

                        description:
                        req.body.description,

                        link:
                        req.body.link,

                        platform:
                        req.body.platform

                    })

                })

            }

        );


        const data =
        await response.json();


        res.json({

            reference:
            ref,

            currency:
            pricing.currency,

            amount:
            pricing.amount,

            ...data

        });


    }catch(err){

        console.error(err);

        res
        .status(500)
        .json({
            message:
            "Crypto failed"
        });

    }

});

module.exports = router;
