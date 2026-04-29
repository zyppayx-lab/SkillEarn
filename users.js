// users.js
// FINAL PRODUCTION VERSION
// Dashboard + wallet + tasks + withdrawals + notifications

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const router = express.Router();

/* ==========================================
   AUTH
========================================== */
function auth(req,res,next){
  const header =
    req.headers.authorization || "";

  const token =
    header.replace("Bearer ","");

  try{
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    next();
  }catch{
    return res.status(401).json({
      message:"Unauthorized"
    });
  }
}

/* ==========================================
   REGISTER
========================================== */
router.post(
"/api/auth/register",
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const {
name,email,phone,password
}=req.body;

if(!name || !email || !password){
return res.status(400).json({
message:"Missing required fields"
});
}

const check=await pool.query(
"SELECT id FROM users WHERE email=$1",
[email]
);

if(check.rows.length>0){
return res.status(400).json({
message:"Email already registered"
});
}

const hashed=
await bcrypt.hash(password,10);

await pool.query(`
INSERT INTO users
(name,email,phone,password_hash,role,balance,status)
VALUES($1,$2,$3,$4,'user',0,'active')
`,[
name,email,phone||"",hashed
]);

res.json({
message:"Registration successful"
});

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   LOGIN
========================================== */
router.post(
"/api/auth/login",
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const {email,password}=req.body;

const result=await pool.query(
"SELECT * FROM users WHERE email=$1",
[email]
);

if(result.rows.length===0){
return res.status(400).json({
message:"Invalid login"
});
}

const user=result.rows[0];

const valid=
await bcrypt.compare(
password,
user.password_hash
);

if(!valid){
return res.status(400).json({
message:"Invalid login"
});
}

const token=jwt.sign(
{
id:user.id,
email:user.email,
role:"user"
},
process.env.JWT_SECRET,
{expiresIn:"7d"}
);

res.json({
message:"Login successful",
token,
user:{
id:user.id,
name:user.name,
email:user.email
}
});

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   USER DASHBOARD
========================================== */
router.get(
"/api/users/dashboard",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const profile=
await pool.query(
`SELECT id,name,email,balance,status
FROM users
WHERE id=$1`,
[req.user.id]
);

const pending=
await pool.query(
`SELECT COUNT(*) total
FROM submissions
WHERE user_id=$1
AND status='PENDING'`,
[req.user.id]
);

const approved=
await pool.query(
`SELECT COUNT(*) total
FROM submissions
WHERE user_id=$1
AND status='APPROVED'`,
[req.user.id]
);

const tasks=
await pool.query(
`SELECT COUNT(*) total
FROM tasks
WHERE status='ACTIVE'`
);

res.json({
profile:
profile.rows[0],
pending:
pending.rows[0].total,
approved:
approved.rows[0].total,
available_tasks:
tasks.rows[0].total
});

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   PROFILE
========================================== */
router.get(
"/api/users/profile",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const result=
await pool.query(
`SELECT id,name,email,phone,
balance,status
FROM users
WHERE id=$1`,
[req.user.id]
);

res.json(result.rows[0]);

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   TASKS
========================================== */
router.get(
"/api/users/tasks",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const result=
await pool.query(`
SELECT
id,title,description,reward,
status,created_at
FROM tasks
WHERE status='ACTIVE'
ORDER BY id DESC
`);

res.json(result.rows);

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   WALLET
========================================== */
router.get(
"/api/users/wallet",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const result=
await pool.query(
`SELECT balance
FROM users
WHERE id=$1`,
[req.user.id]
);

res.json({
balance:
result.rows[0]?.balance || 0,
currency:"NGN"
});

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   USER WITHDRAW
========================================== */
router.post(
"/api/users/withdraw",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const {
amount,
bank_name,
account_name,
account_number
}=req.body;

const bal=
await pool.query(
`SELECT balance
FROM users
WHERE id=$1`,
[req.user.id]
);

const balance=
Number(
bal.rows[0].balance || 0
);

if(Number(amount)>balance){
return res.status(400).json({
message:"Insufficient balance"
});
}

await pool.query(`
INSERT INTO withdrawals
(user_id,amount,bank_name,account_name,account_number,status)
VALUES($1,$2,$3,$4,$5,'PENDING')
`,[
req.user.id,
amount,
bank_name,
account_name,
account_number
]);

await pool.query(`
UPDATE users
SET balance=balance-$1
WHERE id=$2
`,[
amount,
req.user.id
]);

res.json({
message:"Withdrawal request sent"
});

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   TRANSACTIONS
========================================== */
router.get(
"/api/users/transactions",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const result=
await pool.query(
`SELECT *
FROM transactions
WHERE user_id=$1
ORDER BY id DESC`,
[req.user.id]
);

res.json(result.rows);

}catch(error){
res.status(500).json({
message:error.message
});
}
});

/* ==========================================
   NOTIFICATIONS
========================================== */
router.get(
"/api/users/notifications",
auth,
async(req,res)=>{
try{
const pool=req.app.locals.pool;

const result=
await pool.query(
`SELECT *
FROM notifications
WHERE user_id=$1
ORDER BY id DESC`,
[req.user.id]
);

res.json(result.rows);

}catch(error){
res.status(500).json({
message:error.message
});
}
});

module.exports = router;
