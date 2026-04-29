// frontend-config.js
// FINAL PRODUCTION VERSION
// SkillEarn Frontend API Connector

const BASE_URL =
"https://skillearn.onrender.com";

/* ==========================================
   TOKEN HELPERS
========================================== */
function setToken(token) {
  localStorage.setItem(
    "token",
    token
  );
}

function getToken() {
  return localStorage.getItem(
    "token"
  );
}

function removeToken() {
  localStorage.removeItem(
    "token"
  );
}

function logout() {
  removeToken();
  location.href =
    "login.html";
}

/* ==========================================
   UNIVERSAL API REQUEST
========================================== */
async function request(
  endpoint,
  method = "GET",
  body = null,
  useAuth = false
) {
  const headers = {};

  if (!(body instanceof FormData)) {
    headers[
      "Content-Type"
    ] =
      "application/json";
  }

  if (useAuth) {
    headers.Authorization =
      "Bearer " +
      getToken();
  }

  const res = await fetch(
    BASE_URL + endpoint,
    {
      method,
      headers,
      body:
        body instanceof FormData
          ? body
          : body
          ? JSON.stringify(
              body
            )
          : null
    }
  );

  return await res.json();
}

/* ==========================================
   AUTO AUTH CHECK
========================================== */
function requireLogin() {
  const token =
    getToken();

  if (!token) {
    location.href =
      "login.html";
  }
}

/* ==========================================
   USER LOGIN
========================================== */
async function userLogin(
  email,
  password
) {
  const data =
    await request(
      "/api/auth/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    setToken(
      data.token
    );

    location.href =
      "user-dashboard.html";
  } else {
    alert(
      data.message ||
        "Login failed"
    );
  }
}

/* ==========================================
   USER REGISTER
========================================== */
async function userRegister(
  name,
  email,
  phone,
  password
) {
  const data =
    await request(
      "/api/auth/register",
      "POST",
      {
        name,
        email,
        phone,
        password
      }
    );

  alert(
    data.message
  );

  if (
    data.message ===
    "Registration successful"
  ) {
    location.href =
      "login.html";
  }
}

/* ==========================================
   BUSINESS LOGIN
========================================== */
async function businessLogin(
  email,
  password
) {
  const data =
    await request(
      "/api/business/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    setToken(
      data.token
    );

    location.href =
      "business-dashboard.html";
  } else {
    alert(
      data.message ||
        "Login failed"
    );
  }
}

/* ==========================================
   ADMIN LOGIN
========================================== */
async function adminLogin(
  email,
  password
) {
  const data =
    await request(
      "/api/admin/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    setToken(
      data.token
    );

    location.href =
      "admin-dashboard.html";
  } else {
    alert(
      data.message ||
        "Login failed"
    );
  }
}

/* ==========================================
   USER APIs
========================================== */
async function loadDashboard() {
  return await request(
    "/api/users/dashboard",
    "GET",
    null,
    true
  );
}

async function loadProfile() {
  return await request(
    "/api/users/profile",
    "GET",
    null,
    true
  );
}

async function loadTasks() {
  return await request(
    "/api/users/tasks",
    "GET",
    null,
    true
  );
}

async function loadWallet() {
  return await request(
    "/api/users/wallet",
    "GET",
    null,
    true
  );
}

async function loadTransactions() {
  return await request(
    "/api/users/transactions",
    "GET",
    null,
    true
  );
}

async function loadNotifications() {
  return await request(
    "/api/users/notifications",
    "GET",
    null,
    true
  );
}

async function requestWithdrawal(
  amount,
  bank_name,
  account_name,
  account_number
) {
  const data =
    await request(
      "/api/users/withdraw",
      "POST",
      {
        amount,
        bank_name,
        account_name,
        account_number
      },
      true
    );

  alert(
    data.message
  );
}

/* ==========================================
   SUBMISSIONS
========================================== */
async function submitTask(
  task_id,
  task_type,
  proof_text,
  proof_link,
  username,
  fileInputId =
    "screenshot"
) {
  const form =
    new FormData();

  form.append(
    "task_id",
    task_id
  );
  form.append(
    "task_type",
    task_type
  );
  form.append(
    "proof_text",
    proof_text
  );
  form.append(
    "proof_link",
    proof_link
  );
  form.append(
    "username",
    username
  );

  const file =
    document.getElementById(
      fileInputId
    )?.files[0];

  if (file) {
    form.append(
      "screenshot",
      file
    );
  }

  const data =
    await request(
      "/api/submissions/create",
      "POST",
      form,
      true
    );

  alert(
    data.message
  );
}

/* ==========================================
   BUSINESS APIs
========================================== */
async function loadBusinessDashboard() {
  return await request(
    "/api/business/dashboard",
    "GET",
    null,
    true
  );
}

async function loadBusinessJobs() {
  return await request(
    "/api/business/jobs",
    "GET",
    null,
    true
  );
}

async function loadBusinessSubmissions() {
  return await request(
    "/api/business/submissions",
    "GET",
    null,
    true
  );
}

/* ==========================================
   ADMIN APIs
========================================== */
async function loadAdminDashboard() {
  return await request(
    "/api/admin/dashboard",
    "GET",
    null,
    true
  );
}

async function loadAdminUsers() {
  return await request(
    "/api/admin/users",
    "GET",
    null,
    true
  );
}

async function loadAdminVendors() {
  return await request(
    "/api/admin/vendors",
    "GET",
    null,
    true
  );
}

async function loadAdminWithdrawals() {
  return await request(
    "/api/admin/withdrawals",
    "GET",
    null,
    true
  );
       }
