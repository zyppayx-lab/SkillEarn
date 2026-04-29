// frontend-config.js
// FINAL PRODUCTION VERSION
// Connect all HTML pages to SkillEarn backend

const BASE_URL =
"https://skillearn.onrender.com";

/* ==========================================
   HELPERS
========================================== */
function getToken() {
  return localStorage.getItem(
    "token"
  );
}

function saveToken(token) {
  localStorage.setItem(
    "token",
    token
  );
}

function logout() {
  localStorage.removeItem(
    "token"
  );
  location.href =
    "login.html";
}

async function api(
  endpoint,
  method = "GET",
  body = null,
  auth = false
) {
  const headers = {
    "Content-Type":
      "application/json"
  };

  if (auth) {
    headers.Authorization =
      "Bearer " +
      getToken();
  }

  const res = await fetch(
    BASE_URL + endpoint,
    {
      method,
      headers,
      body: body
        ? JSON.stringify(
            body
          )
        : null
    }
  );

  return await res.json();
}

/* ==========================================
   USER LOGIN
========================================== */
async function userLogin(
  email,
  password
) {
  const data =
    await api(
      "/api/auth/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    saveToken(
      data.token
    );

    location.href =
      "user-dashboard.html";
  } else {
    alert(
      data.message
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
    await api(
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
    await api(
      "/api/business/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    saveToken(
      data.token
    );

    location.href =
      "business-dashboard.html";
  } else {
    alert(
      data.message
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
    await api(
      "/api/admin/login",
      "POST",
      {
        email,
        password
      }
    );

  if (data.token) {
    saveToken(
      data.token
    );

    location.href =
      "admin-dashboard.html";
  } else {
    alert(
      data.message
    );
  }
}

/* ==========================================
   USER DASHBOARD
========================================== */
async function loadUserDashboard() {
  const data =
    await api(
      "/api/users/dashboard",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   LOAD TASKS
========================================== */
async function loadTasks() {
  const data =
    await api(
      "/api/users/tasks",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   USER PROFILE
========================================== */
async function loadProfile() {
  const data =
    await api(
      "/api/users/profile",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   USER WALLET
========================================== */
async function loadWallet() {
  const data =
    await api(
      "/api/users/wallet",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   TRANSACTIONS
========================================== */
async function loadTransactions() {
  const data =
    await api(
      "/api/users/transactions",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   NOTIFICATIONS
========================================== */
async function loadNotifications() {
  const data =
    await api(
      "/api/users/notifications",
      "GET",
      null,
      true
    );

  return data;
}

/* ==========================================
   WITHDRAW
========================================== */
async function withdraw(
  amount,
  bank_name,
  account_name,
  account_number
) {
  const data =
    await api(
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
   SUBMIT TASK
========================================== */
async function submitTask(
  task_id,
  task_type,
  proof_text,
  proof_link,
  username
) {
  const token =
    getToken();

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
      "screenshot"
    )?.files[0];

  if (file) {
    form.append(
      "screenshot",
      file
    );
  }

  const res =
    await fetch(
      BASE_URL +
        "/api/submissions/create",
      {
        method:
          "POST",
        headers: {
          Authorization:
            "Bearer " +
            token
        },
        body: form
      }
    );

  const data =
    await res.json();

  alert(
    data.message
  );
}

/* ==========================================
   BUSINESS DASHBOARD
========================================== */
async function loadBusinessDashboard() {
  return await api(
    "/api/business/dashboard",
    "GET",
    null,
    true
  );
}

/* ==========================================
   ADMIN DASHBOARD
========================================== */
async function loadAdminDashboard() {
  return await api(
    "/api/admin/dashboard",
    "GET",
    null,
    true
  );
         }
