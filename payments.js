// payments.js
// FINAL PRODUCTION VERSION
// PAYSTACK + CRYPTO + COUNTRY PRICING

const express = require("express");
const jwt = require("jsonwebtoken");

let fetchFn;

try{
    fetchFn = fetch;
}catch{
    fetchFn = require("node-fetch");
}

const router =
express.Router();


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
    vendorCountry,
    purpose,
    category,
    qty
){

    qty =
    Number(qty) || 1;


    /* SOCIAL */
    if(
        purpose === "social"
    ){

        if(
            isNigeria(
                vendorCountry
            )
        ){

            return {

                currency:"NGN",

                amount:
                qty * 50

            };

        }


        return {

            currency:"USD",

            amount:Number(

                (
                    qty * 0.036
                ).toFixed(3)

            )

        };

    }


    /* HIRING */
    if(
        purpose === "hiring"
    ){

        if(
            isNigeria(
                vendorCountry
            )
        ){

            return {

                currency:"NGN",

                amount:2000

            };

        }


        return {

            currency:"USD",

            amount:
            ngnToUsd(
                2000
            )

        };

    }


    /* FREELANCE */
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
            isNigeria(
                vendorCountry
            )
        ){

            return {

                currency:"NGN",

                amount:
                usdToNgn(
                    amount
                )

            };

        }


        return {

            currency:"USD",

            amount

        };

    }


    /* INFLUENCER */
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
            isNigeria(
                vendorCountry
            )
        ){

            return {

                currency:"NGN",

                amount:
                usdToNgn(
                    amount
                )

            };

        }


        return {

            currency:"USD",

            amount

        };

    }


    /* TASK */
    if(
        purpose === "task"
    ){

        if(
            isNigeria(
                vendorCountry
            )
        ){

            return {

                currency:"NGN",

                amount:
                qty * 50

            };

        }


        return {

            currency:"USD",

            amount:Number(

                (
                    qty * 0.036
                ).toFixed(3)

            )

        };

    }


    return null;

}


/* ==========================================
PAYSTACK
========================================== */
async function initPaystack(

    email,
    amount,
    ref,
    meta

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

                metadata:
                meta

            })

        }

    );


    return await
    response.json();

}


/* ==========================================
PAYSTACK PAYMENT
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
                "Use crypto payment"

            });

        }


        const {

            email,
            purpose,
            category,
            qty

        } = req.body;


        const pricing =
        calcPrice(

            req.user.country,

            purpose,

            category,

            qty

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

            purpose,

            category,

            qty,

            country:
            req.user.country,

            title:
            `${purpose} campaign`,

            description:
            `${category} job`

        };


        const data =
        await initPaystack(

            email,

            pricing.amount,

            ref,

            metadata

        );


        if(
            !data.status
        ){

            return res
            .status(400)
            .json({

                message:
                "Payment init failed"

            });

        }


        res.json({

            currency:
            pricing.currency,

            amount:
            pricing.amount,

            reference:
            ref,

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


        const {

            purpose,
            category,
            qty,
            pay_currency

        } = req.body;


        const pricing =
        calcPrice(

            req.user.country,

            purpose,

            category,

            qty

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

                    pay_currency ||

                    "usdttrc20",

                    order_id:
                    ref,

                    order_description:

                    `${purpose}|`+

                    `${category}|`+

                    `${req.user.id}|`+

                    `${purpose} campaign|`+

                    `${category} job`

                })

            }

        );


        const data =
        await response
        .json();


        res.json({

            currency:
            pricing.currency,

            amount:
            pricing.amount,

            reference:
            ref,

            ...data

        });


    }catch(err){

        console.error(err);

        res
        .status(500)
        .json({

            message:
            "Crypto payment failed"

        });

    }

});

module.exports = router;
