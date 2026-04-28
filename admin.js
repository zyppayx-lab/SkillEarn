// admin.js
// Save this file as: admin.js

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

/* =========================
   ADMIN ONLY
========================= */
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin only"
    });
  }

  next();
}

/* ==================================================
   ADMIN DASHBOARD
================================================== */
router.get(
  "/api/admin/dashboard",
  auth,
  adminOnly,
  async (req, res) => {
    res.json({
      status: "Admin dashboard active",
      users: 0,
      vendors: 0,
      tasks: 0,
      withdrawals: 0
    });
  }
);

/* ==================================================
   APPROVE BUSINESS ACCOUNT
================================================== */
router.post(
  "/api/admin/business/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const { vendor_id } = req.body;

    res.json({
      message: "Business approved",
      vendor_id
    });
  }
);

/* ==================================================
   BLOCK BUSINESS ACCOUNT
================================================== */
router.post(
  "/api/admin/business/block",
  auth,
  adminOnly,
  async (req, res) => {
    const { vendor_id } = req.body;

    res.json({
      message: "Business blocked",
      vendor_id
    });
  }
);

/* ==================================================
   APPROVE TASK
================================================== */
router.post(
  "/api/admin/task/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const { task_id } = req.body;

    res.json({
      message: "Task approved",
      task_id
    });
  }
);

/* ==================================================
   DELETE TASK
================================================== */
router.post(
  "/api/admin/task/delete",
  auth,
  adminOnly,
  async (req, res) => {
    const { task_id } = req.body;

    res.json({
      message: "Task deleted",
      task_id
    });
  }
);

/* ==================================================
   APPROVE WITHDRAWAL
================================================== */
router.post(
  "/api/admin/withdrawal/approve",
  auth,
  adminOnly,
  async (req, res) => {
    const { withdrawal_id } = req.body;

    res.json({
      message: "Withdrawal approved",
      withdrawal_id
    });
  }
);

/* ==================================================
   PLATFORM STATS
================================================== */
router.get(
  "/api/admin/stats",
  auth,
  adminOnly,
  async (req, res) => {
    res.json({
      total_users: 0,
      total_businesses: 0,
      total_tasks: 0,
      total_earnings: 0
    });
  }
);

module.exports = router;
