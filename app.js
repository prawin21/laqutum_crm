// app.js for Admin CRM

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentUsersList = [];
let performanceChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Determine which page we're on
    const isLoginPage = document.getElementById('admin-login-form') !== null;
    const isDashboardPage = document.getElementById('users-table') !== null;

    // Check Auth State
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        // User is logged in, check if admin
        await verifyAdmin(session.user, isLoginPage, isDashboardPage);
    } else {
        // Not logged in
        if (isDashboardPage) {
            window.location.href = 'index.html';
        } else {
            initLogin();
        }
    }
});

async function verifyAdmin(user, isLoginPage, isDashboardPage) {
    try {
        const { data, error } = await supabase
            .from('user_progress')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (error || !data || !data.is_admin) {
            // Not an admin
            if (isLoginPage) {
                showError("Access Denied: You do not have admin privileges.");
                await supabase.auth.signOut();
                initLogin(); // Re-initialize login form so they can try again
            } else {
                window.location.href = 'index.html';
            }
        } else {
            // Is an admin
            currentUser = user;
            if (isLoginPage) {
                window.location.href = 'dashboard.html';
            } else {
                initDashboard();
            }
        }
    } catch (e) {
        console.error(e);
        if (isLoginPage) showError("Database connection failed.");
    }
}

// ================= LOGIN PAGE =================
function initLogin() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        hideError();
        const spinner = document.getElementById('login-spinner');
        if(spinner) spinner.classList.remove('hidden');

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            showError(error.message);
            if(spinner) spinner.classList.add('hidden');
        } else {
            // Verify admin rights
            await verifyAdmin(data.user, true, false);
        }
    });
}

function showError(msg) {
    const err = document.getElementById('error-msg');
    if (err) {
        err.textContent = msg;
        err.classList.remove('hidden');
    }
}

function hideError() {
    const err = document.getElementById('error-msg');
    if (err) err.classList.add('hidden');
}

// ================= DASHBOARD PAGE =================
function initDashboard() {
    document.getElementById('admin-email').textContent = currentUser.email;

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    document.getElementById('refresh-btn').addEventListener('click', loadUsers);
    document.getElementById('search-users').addEventListener('input', (e) => filterUsers(e.target.value));

    // Modal listeners
    document.getElementById('close-modal').addEventListener('click', () => {
        document.getElementById('user-modal').classList.add('hidden');
    });

    loadUsers();
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const loading = document.getElementById('table-loading');
    
    tbody.innerHTML = '';
    loading.classList.remove('hidden');
    loading.textContent = 'Loading users...';

    // Fetch from auth.users via RPC or just rely on user_progress table
    // Since we can't query auth.users directly from client, we query user_progress
    // which should contain all users who logged in.
    const { data, error } = await supabase
        .from('user_progress')
        .select('*')
        .order('created_at', { ascending: false });

    loading.classList.add('hidden');

    if (error) {
        console.error(error);
        loading.classList.remove('hidden');
        loading.textContent = 'Error loading users. Check RLS policies.';
        return;
    }

    currentUsersList = data;
    renderUsers(currentUsersList);
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">No users found.</td></tr>`;
        return;
    }

    users.forEach(u => {
        // We don't store email in user_progress by default, 
        // so we'll use user_id as a fallback if you don't add email.
        const displayName = u.user_id.substring(0, 8) + '...'; 
        const date = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';
        const isBanned = u.is_banned === true;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${displayName}</td>
            <td>${date}</td>
            <td>${u.xp || 0}</td>
            <td>${u.streak || 0}</td>
            <td><span class="status-badge ${isBanned ? 'status-banned' : 'status-active'}">${isBanned ? 'BANNED' : 'ACTIVE'}</span></td>
            <td><a class="action-link" data-id="${u.user_id}">View Details</a></td>
        `;
        tbody.appendChild(tr);
    });

    // Add click listeners to links
    document.querySelectorAll('.action-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const uid = e.target.getAttribute('data-id');
            const user = currentUsersList.find(x => x.user_id === uid);
            if (user) openUserModal(user);
        });
    });
}

function filterUsers(query) {
    if (!query) {
        renderUsers(currentUsersList);
        return;
    }
    const q = query.toLowerCase();
    const filtered = currentUsersList.filter(u => u.user_id.toLowerCase().includes(q));
    renderUsers(filtered);
}

// ================= MODAL & CHART =================
function openUserModal(user) {
    const modal = document.getElementById('user-modal');
    modal.classList.remove('hidden');

    document.getElementById('modal-user-email').textContent = "User: " + user.user_id.substring(0, 12);
    document.getElementById('modal-xp').textContent = user.xp || 0;
    document.getElementById('modal-streak').textContent = user.streak || 0;
    
    const topics = user.unlocked_topics || [];
    document.getElementById('modal-topics').textContent = topics.length > 0 ? topics.join(', ') : 'None';

    const banBtn = document.getElementById('ban-toggle-btn');
    if (user.is_banned) {
        banBtn.textContent = 'Unban User';
        banBtn.className = 'secondary-btn'; // Make it look safer
    } else {
        banBtn.textContent = 'Ban User';
        banBtn.className = 'danger-btn';
    }

    // Remove old listener and add new one
    const newBanBtn = banBtn.cloneNode(true);
    banBtn.parentNode.replaceChild(newBanBtn, banBtn);
    
    newBanBtn.addEventListener('click', async () => {
        const newStatus = !user.is_banned;
        const { error } = await supabase
            .from('user_progress')
            .update({ is_banned: newStatus })
            .eq('user_id', user.user_id);
            
        if (!error) {
            user.is_banned = newStatus;
            openUserModal(user); // refresh modal
            renderUsers(currentUsersList); // refresh table
        } else {
            alert("Failed to update status. Check RLS policies.");
        }
    });

    renderChart(user);
}

function renderChart(user) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
    if (performanceChartInstance) {
        performanceChartInstance.destroy();
    }

    // Mock extraction of data: In reality, you'd parse user.confidence_states and user.quiz_results
    // For demo, we just show a static learning curve or a simple parsed version
    let labels = ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5'];
    let predictedData = [20, 35, 50, 65, 80];
    let actualData = [15, 40, 45, 70, 75];

    if (user.quiz_results && user.quiz_results.length > 0) {
        // Attempt basic parsing
        labels = user.quiz_results.map((_, i) => 'Q' + (i+1));
        let runningAcc = 0;
        actualData = user.quiz_results.map((r, i) => {
            runningAcc += r.correct ? 1 : 0;
            return Math.round((runningAcc / (i+1)) * 100);
        });
        predictedData = actualData.map(a => a + (Math.random()*10 - 5)); // Fake prediction trend
    }

    performanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Predicted Skill (%)',
                    data: predictedData,
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Actual Accuracy (%)',
                    data: actualData,
                    borderColor: '#10B981',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#94A3B8' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94A3B8' }
                },
                x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94A3B8' }
                }
            }
        }
    });
}
