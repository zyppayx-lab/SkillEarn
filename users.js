// users.js
// Save this file as: users.js

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/* =========================
   AUTH
========================= */
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
    next();
  } catch {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }
}

/* ==================================================
   USER PROFILE
================================================== */
router.get(
  "/api/users/profile",
  auth,
  async (req, res) => {
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      balance: 0,
      status: "Active"
    });
  }
);

/* ==================================================
   UPDATE PROFILE
================================================== */
router.post(
  "/api/users/update-profile",
  auth,
  async (req, res) => {
    const {
      name,
      phone,
      country
    } = req.body;

    res.json({
      message: "Profile updated",
      name,
      phone,
      country
    });
  }
);

/* ==================================================
   WALLET BALANCE
================================================== */
router.get(
  "/api/users/wallet",
  auth,
  async (req, res) => {
    res.json({
      balance: 0,
      currency: "NGN"
    });
  }
);

/* ==================================================
   USER TASK HISTORY
================================================== */
router.get(
  "/api/users/tasks",
  auth,
  async (req, res) => {
    res.json([
      {
        id: 1,
        title: "Instagram Follow",
        reward: 1000,
        status: "Completed"
      },
      {
        id: 2,
        title: "YouTube Subscribe",
        reward: 1500,
        status: "Pending"
      }
    ]);
  }
);

/* ==================================================
   USER TRANSACTIONS
================================================== */
router.get(
  "/api/users/transactions",
  auth,
  async (req, res) => {
    res.json([
      {
        type: "earning",
        amount: 1000,
        status: "success"
      },
      {
        type: "withdrawal",
        amount: 5000,
        status: "pending"
      }
    ]);
  }
);

/* ==================================================
   WITHDRAW FUNDS
================================================== */
router.post(
  "/api/users/withdraw",
  auth,
  async (req, res) => {
    const {
      method,
      amount
    } = req.body;

    res.json({
      message: "Withdrawal submitted",
      method,
      amount
    });
  }
);

/* ==================================================
   NOTIFICATIONS
================================================== */
router.get(
  "/api/users/notifications",
  auth,
  async (req, res) => {
    res.json([
      {
        title: "Welcome to SkillEarn"
      },
      {
        title: "Your withdrawal is pending"
      }
    ]);
  }
);

module.exports = router;
