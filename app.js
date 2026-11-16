// app.js for Admin CRM with Full Access Control

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let currentUsersList = [];
let performanceChartInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Determine which page we're on
    const isLoginPage = document.getElementById('admin-login-form') !== null;
    const isDashboardPage = document.getElementById('users-table') !== null;

    try {
        // Check Auth State
        const { data: { session }, error } = await db.auth.getSession();
        
        if (error) {
            console.warn("Session check error:", error);
        }

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
    } catch (err) {
        console.error("Critical error during init:", err);
        if (isLoginPage) {
            initLogin();
        } else if (isDashboardPage) {
            window.location.href = 'index.html';
        }
    }
});

async function verifyAdmin(user, isLoginPage, isDashboardPage) {
    try {
        const { data, error } = await db
            .from('user_progress')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (error || !data || !data.is_admin) {
            // Not an admin
            if (isLoginPage) {
                showError("Access Denied: You do not have admin privileges.");
                await db.auth.signOut();
                initLogin();
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

        const { data, error } = await db.auth.signInWithPassword({ email, password });
        
        if (error) {
            showError(error.message);
            if(spinner) spinner.classList.add('hidden');
        } else {
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
    const emailEl = document.getElementById('admin-email');
    if (emailEl && currentUser) emailEl.textContent = currentUser.email;

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await db.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);

    const syncBtn = document.getElementById('sync-emails-btn');
    if (syncBtn) syncBtn.addEventListener('click', handleSyncEmailsClick);

    const closeSyncModalBtn = document.getElementById('close-sync-modal');
    if (closeSyncModalBtn) closeSyncModalBtn.addEventListener('click', closeSyncModal);

    const copySqlBtn = document.getElementById('copy-sql-btn');
    if (copySqlBtn) {
        copySqlBtn.addEventListener('click', copySyncSqlToClipboard);
    }

    const btnSqlDoneRefresh = document.getElementById('btn-sql-done-refresh');
    if (btnSqlDoneRefresh) {
        btnSqlDoneRefresh.addEventListener('click', async () => {
            closeSyncModal();
            showToast('🔄 Refreshing users from database...');
            await loadUsers();
        });
    }

    const btnSyncViaKey = document.getElementById('btn-sync-via-key');
    if (btnSyncViaKey) {
        btnSyncViaKey.addEventListener('click', async () => {
            const keyInput = document.getElementById('input-service-key');
            if (keyInput) {
                await syncEmailsViaSecretKey(keyInput.value);
            }
        });
    }

    const searchInput = document.getElementById('search-users');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterUsers(e.target.value));
    }

    const closeModalBtn = document.getElementById('close-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            const userModal = document.getElementById('user-modal');
            if (userModal) userModal.classList.add('hidden');
        });
    }

    loadUsers();
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const loading = document.getElementById('table-loading');
    
    if (tbody) tbody.innerHTML = '';
    if (loading) {
        loading.classList.remove('hidden');
        loading.textContent = 'Loading users...';
    }

    // Fetch from user_progress
    const { data, error } = await db
        .from('user_progress')
        .select('*')
        .order('created_at', { ascending: false });

    if (loading) loading.classList.add('hidden');

    if (error) {
        console.error(error);
        if (loading) {
            loading.classList.remove('hidden');
            loading.textContent = 'Error loading users. Check Supabase connection & RLS.';
        }
        return;
    }

    currentUsersList = data || [];
    updateKPIs();
    renderUsers(currentUsersList);
}

function isUserFullAccess(user) {
    if (!user || !user.unlocked_topics) return false;
    const ut = user.unlocked_topics;
    if (ut.includes('*') || ut.includes('all')) return true;
    if (ALL_TOPICS.length > 0 && ut.length >= ALL_TOPICS.length) return true;
    return false;
}

function updateKPIs() {
    const total = currentUsersList.length;
    let fullAccessCount = 0;
    let premiumCount = 0;
    let totalXp = 0;
    let bannedCount = 0;

    currentUsersList.forEach(u => {
        const isFull = isUserFullAccess(u);
        if (isFull) {
            fullAccessCount++;
            premiumCount++;
        } else if (u.unlocked_topics && u.unlocked_topics.length >= 2) {
            premiumCount++;
        }
        totalXp += (u.xp || 0);
        if (u.is_banned) bannedCount++;
    });

    const avgXp = total > 0 ? Math.round(totalXp / total) : 0;

    const elTotal = document.getElementById('kpi-total');
    const elFull = document.getElementById('kpi-full-access');
    const elPrem = document.getElementById('kpi-premium');
    const elXp = document.getElementById('kpi-xp');
    const elBanned = document.getElementById('kpi-banned');

    if (elTotal) elTotal.textContent = total;
    if (elFull) elFull.textContent = fullAccessCount;
    if (elPrem) elPrem.textContent = premiumCount;
    if (elXp) elXp.textContent = avgXp;
    if (elBanned) elBanned.textContent = bannedCount;
}

function filterUsers(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = currentUsersList.filter(u => {
        const idMatch = u.user_id && u.user_id.toLowerCase().includes(q);
        const emailMatch = u.email && u.email.toLowerCase().includes(q);
        const isFull = isUserFullAccess(u);
        const fullMatch = (q === 'full' || q === 'full access') && isFull;
        const bannedMatch = q === 'banned' && u.is_banned;
        return idMatch || emailMatch || fullMatch || bannedMatch;
    });
    renderUsers(filtered);
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:#94A3B8;">No users found matching query.</td></tr>`;
        return;
    }

    users.forEach(u => {
        const hasEmail = Boolean(u.email && u.email.trim());
        const date = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Unknown';
        const isBanned = u.is_banned === true;
        const isFull = isUserFullAccess(u);
        const unlockedCount = (u.unlocked_topics || []).filter(t => t !== '*').length;

        let accessBadgeHTML = '';
        if (isFull) {
            accessBadgeHTML = `<span class="access-badge badge-full">👑 FULL ACCESS</span>`;
        } else if (unlockedCount >= 2) {
            accessBadgeHTML = `<span class="access-badge badge-premium">⭐ ${unlockedCount} Topics</span>`;
        } else {
            accessBadgeHTML = `<span class="access-badge badge-free">🔒 Free (${unlockedCount}/2)</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                ${hasEmail 
                    ? `<div style="font-family:monospace; font-size:0.88rem; font-weight:600; color:#38bdf8;">${u.email}</div>` 
                    : `<div style="font-size:0.84rem; font-weight:600; color:#f87171;">⚠️ No Email Stored</div>`}
                <div style="font-size:0.72rem; color:#64748b; font-family:monospace; margin-top:2px;">
                    ${u.user_id ? `ID: ${u.user_id}` : ''}
                    <button class="btn-table-edit-email" data-id="${u.user_id}" style="background:transparent; border:none; color:#a855f7; cursor:pointer; text-decoration:underline; padding:0 4px; font-size:0.72rem;">${hasEmail ? 'Edit Email' : '+ Set Email'}</button>
                </div>
            </td>
            <td>${date}</td>
            <td>
                <div><span style="color:#e2e8f0; font-weight:600;">⚡ ${u.xp || 0}</span> XP</div>
                <div style="font-size:0.76rem; color:#94a3b8;">🔥 Streak: ${u.streak || 0}</div>
            </td>
            <td>${accessBadgeHTML}</td>
            <td><span class="status-badge ${isBanned ? 'status-banned' : 'status-active'}">${isBanned ? 'BANNED' : 'ACTIVE'}</span></td>
            <td>
                <div class="actions-cell">
                    ${isFull 
                        ? `<button class="btn-action btn-revoke btn-quick-revoke" data-id="${u.user_id}">Revoke Access</button>`
                        : `<button class="btn-action btn-grant btn-quick-grant" data-id="${u.user_id}">✨ Give Full Access</button>`}
                    <button class="btn-action btn-details btn-view-details" data-id="${u.user_id}">Details</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Wire table quick action buttons
    tbody.querySelectorAll('.btn-quick-grant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.getAttribute('data-id');
            grantFullAccess(uid);
        });
    });

    tbody.querySelectorAll('.btn-quick-revoke').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.getAttribute('data-id');
            revokeFullAccess(uid);
        });
    });

    tbody.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.getAttribute('data-id');
            const user = currentUsersList.find(x => x.user_id === uid);
            if (user) openAdvancedModal(user);
        });
    });

    tbody.querySelectorAll('.btn-table-edit-email').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const uid = e.currentTarget.getAttribute('data-id');
            promptUserEmail(uid);
        });
    });
}

// Comprehensive All Topics Definition across all categories (47 topics)
const ALL_TOPICS = [
    // Arithmetic
    { id: 'percentages', name: 'Percentages & Shortcuts', category: 'Arithmetic' },
    { id: 'profit-loss', name: 'Profit & Loss', category: 'Arithmetic' },
    { id: 'si-ci', name: 'Simple & Compound Interest', category: 'Arithmetic' },
    { id: 'averages', name: 'Averages & Weighted Mean', category: 'Arithmetic' },
    { id: 'ratio', name: 'Ratio & Proportion', category: 'Arithmetic' },
    { id: 'hcf-lcm', name: 'HCF & LCM Concepts', category: 'Arithmetic' },
    { id: 'partnership', name: 'Partnership', category: 'Arithmetic' },
    { id: 'mixtures', name: 'Mixture & Alligation', category: 'Arithmetic' },
    { id: 'age-problems', name: 'Problems on Ages', category: 'Arithmetic' },
    // Speed & Work
    { id: 'time-work', name: 'Time & Work', category: 'Speed & Work' },
    { id: 'pipes', name: 'Pipes & Cisterns', category: 'Speed & Work' },
    { id: 'tsd', name: 'Time, Speed & Distance', category: 'Speed & Work' },
    { id: 'trains', name: 'Problems on Trains', category: 'Speed & Work' },
    { id: 'boats', name: 'Boats & Streams', category: 'Speed & Work' },
    { id: 'races', name: 'Races & Games of Skill', category: 'Speed & Work' },
    // Algebra & Numbers
    { id: 'linear-eq', name: 'Linear Equations', category: 'Algebra & Numbers' },
    { id: 'quadratic', name: 'Quadratic Equations', category: 'Algebra & Numbers' },
    { id: 'progressions', name: 'Progressions (AP, GP, HP)', category: 'Algebra & Numbers' },
    { id: 'permutations', name: 'Permutations & Combinations', category: 'Algebra & Numbers' },
    { id: 'probability', name: 'Probability Concepts', category: 'Algebra & Numbers' },
    { id: 'set-theory', name: 'Set Theory & Venn Diagrams', category: 'Algebra & Numbers' },
    { id: 'logarithms', name: 'Logarithms & Properties', category: 'Algebra & Numbers' },
    { id: 'surds', name: 'Surds & Indices', category: 'Algebra & Numbers' },
    { id: 'number-systems', name: 'Number Systems & Divisibility', category: 'Algebra & Numbers' },
    { id: 'remainders', name: 'Remainders & Modular Arithmetic', category: 'Algebra & Numbers' },
    // Geometry & Mensuration
    { id: 'triangles', name: 'Triangles & Properties', category: 'Geometry & Mensuration' },
    { id: 'circles', name: 'Circles, Tangents & Chords', category: 'Geometry & Mensuration' },
    { id: 'quadrilaterals', name: 'Quadrilaterals & Polygons', category: 'Geometry & Mensuration' },
    { id: 'mensuration-2d', name: '2D Mensuration', category: 'Geometry & Mensuration' },
    { id: 'mensuration-3d', name: '3D Mensuration', category: 'Geometry & Mensuration' },
    { id: 'coordinate-geo', name: 'Coordinate Geometry', category: 'Geometry & Mensuration' },
    { id: 'trigonometry', name: 'Trigonometry & Heights', category: 'Geometry & Mensuration' },
    // Logical Reasoning
    { id: 'coding-decoding', name: 'Coding-Decoding', category: 'Logical Reasoning' },
    { id: 'blood-relations', name: 'Blood Relations', category: 'Logical Reasoning' },
    { id: 'seating-linear', name: 'Linear Seating', category: 'Logical Reasoning' },
    { id: 'seating-circular', name: 'Circular Seating', category: 'Logical Reasoning' },
    { id: 'puzzles-grid', name: 'Logical Puzzles & Grid', category: 'Logical Reasoning' },
    { id: 'clocks-calendars', name: 'Clocks & Calendars', category: 'Logical Reasoning' },
    { id: 'syllogisms', name: 'Syllogisms & Deductions', category: 'Logical Reasoning' },
    { id: 'direction-test', name: 'Direction Sense', category: 'Logical Reasoning' },
    { id: 'number-series', name: 'Number Series', category: 'Logical Reasoning' },
    { id: 'input-output', name: 'Input-Output Sorting', category: 'Logical Reasoning' },
    // Data Interpretation
    { id: 'data-tables', name: 'Data Tables', category: 'Data Interpretation' },
    { id: 'bar-charts', name: 'Bar Charts', category: 'Data Interpretation' },
    { id: 'pie-charts', name: 'Pie Charts', category: 'Data Interpretation' },
    { id: 'line-graphs', name: 'Line Graphs', category: 'Data Interpretation' },
    { id: 'data-sufficiency', name: 'Data Sufficiency', category: 'Data Interpretation' }
];

async function grantFullAccess(userId) {
    const user = currentUsersList.find(u => u.user_id === userId);
    if (!user) return;

    const allTopicIds = ALL_TOPICS.map(t => t.id);
    const fullList = ['*', ...allTopicIds];

    user.unlocked_topics = fullList;

    const { error } = await db
        .from('user_progress')
        .update({ unlocked_topics: fullList })
        .eq('user_id', userId);

    if (error) {
        showToast('❌ Error granting full access: ' + error.message, true);
        return;
    }

    updateKPIs();
    renderUsers(currentUsersList);

    const modal = document.getElementById('advanced-modal');
    if (modal && !modal.classList.contains('hidden')) {
        openAdvancedModal(user);
    }

    showToast(`👑 Full Access Granted! ${user.email || 'User'} can now access all concepts without paying.`);
}

async function revokeFullAccess(userId) {
    const user = currentUsersList.find(u => u.user_id === userId);
    if (!user) return;

    if (!confirm(`Are you sure you want to revoke full access for ${user.email || 'this user'}? They will return to standard free tier limit.`)) {
        return;
    }

    user.unlocked_topics = [];

    const { error } = await db
        .from('user_progress')
        .update({ unlocked_topics: [] })
        .eq('user_id', userId);

    if (error) {
        showToast('❌ Error revoking access: ' + error.message, true);
        return;
    }

    updateKPIs();
    renderUsers(currentUsersList);

    const modal = document.getElementById('advanced-modal');
    if (modal && !modal.classList.contains('hidden')) {
        openAdvancedModal(user);
    }

    showToast(`🔒 Full Access revoked for ${user.email || 'user'}.`);
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('crm-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderColor = isError ? 'rgba(239, 68, 68, 0.6)' : 'rgba(168, 85, 247, 0.6)';
    toast.classList.remove('hidden');

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3800);
}

async function promptUserEmail(userId) {
    const user = currentUsersList.find(u => u.user_id === userId);
    const current = (user && user.email) || '';
    const entered = prompt(`Enter email address for user ID (${userId}):`, current);
    if (entered === null) return;
    const clean = entered.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
        showToast('❌ Please enter a valid email address.', true);
        return;
    }
    await updateUserEmail(userId, clean);
}

async function updateUserEmail(userId, newEmail) {
    const cleanEmail = newEmail.trim().toLowerCase();
    const { error } = await db
        .from('user_progress')
        .update({ email: cleanEmail })
        .eq('user_id', userId);

    if (error) {
        showToast('❌ Error updating email: ' + error.message, true);
        return;
    }

    const user = currentUsersList.find(u => u.user_id === userId);
    if (user) user.email = cleanEmail;

    renderUsers(currentUsersList);

    const modalEmail = document.getElementById('modal-email');
    if (modalEmail) modalEmail.textContent = cleanEmail;

    showToast(`✅ Email saved: ${cleanEmail}`);
}

function openAdvancedModal(user) {
    const emailEl = document.getElementById('modal-email');
    if (emailEl) emailEl.textContent = user.email || 'None (No email recorded)';

    const editEmailBtn = document.getElementById('btn-edit-user-email');
    if (editEmailBtn) {
        editEmailBtn.onclick = () => promptUserEmail(user.user_id);
    }

    document.getElementById('modal-id').textContent = user.user_id;
    document.getElementById('modal-joined').textContent = user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A';
    document.getElementById('modal-xp').textContent = user.xp || 0;

    document.getElementById('modal-diag-status').textContent = user.has_completed_diagnostic ? '✅ Completed' : '⏳ Pending';
    document.getElementById('modal-diag-target').textContent = user.survey_target || 'N/A';
    document.getElementById('modal-diag-knowledge').textContent = user.survey_knowledge || 'N/A';

    const isFull = isUserFullAccess(user);

    // Render Master VIP Full Access Banner Box
    const fullAccessBox = document.getElementById('modal-full-access-box');
    if (fullAccessBox) {
        fullAccessBox.className = 'vip-access-card ' + (isFull ? 'vip-active' : 'vip-inactive');
        fullAccessBox.innerHTML = `
            <div class="vip-info">
                <div class="vip-icon">${isFull ? '👑' : '🎁'}</div>
                <div>
                    <div class="vip-title">${isFull ? 'Full Access Active (All Concepts Unlocked)' : 'Standard Free Tier User'}</div>
                    <div class="vip-desc">
                        ${isFull 
                            ? 'This user has 100% unrestricted access to every topic, pattern, and practice problem without paying.' 
                            : 'Give this user free lifetime access to all 47+ aptitude topics, concepts, shortcuts, and tests.'}
                    </div>
                </div>
            </div>
            <div>
                ${isFull 
                    ? `<button type="button" class="vip-btn-revoke" id="btn-modal-revoke-full">Revoke Full Access</button>`
                    : `<button type="button" class="vip-btn-grant" id="btn-modal-grant-full">✨ Grant Full Access</button>`}
            </div>
        `;

        const btnGrant = document.getElementById('btn-modal-grant-full');
        if (btnGrant) {
            btnGrant.onclick = () => grantFullAccess(user.user_id);
        }

        const btnRevoke = document.getElementById('btn-modal-revoke-full');
        if (btnRevoke) {
            btnRevoke.onclick = () => revokeFullAccess(user.user_id);
        }
    }

    // Batch Unlock / Lock buttons
    const btnUnlockAll = document.getElementById('btn-unlock-all-topics');
    if (btnUnlockAll) {
        btnUnlockAll.onclick = () => grantFullAccess(user.user_id);
    }

    const btnLockAll = document.getElementById('btn-lock-all-topics');
    if (btnLockAll) {
        btnLockAll.onclick = () => revokeFullAccess(user.user_id);
    }

    // Render Topics Grid with Categories and Search Filter
    renderModalTopicsGrid(user);

    const searchInput = document.getElementById('modal-topics-search');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
            renderModalTopicsGrid(user, e.target.value);
        };
    }

    const resetBtn = document.getElementById('modal-reset-diag');
    if (resetBtn) {
        resetBtn.onclick = async () => {
            if(confirm('Are you sure you want to force this user to retake the diagnostic survey?')) {
                await db.from('user_progress').update({ has_completed_diagnostic: false }).eq('user_id', user.user_id);
                showToast('Diagnostic reset successfully.');
                document.getElementById('advanced-modal').classList.add('hidden');
                loadUsers();
            }
        };
    }

    const modal = document.getElementById('advanced-modal');
    if (modal) modal.classList.remove('hidden');
}

function renderModalTopicsGrid(user, filterQuery = '') {
    const topicsGrid = document.getElementById('modal-topics-grid');
    if (!topicsGrid) return;
    topicsGrid.innerHTML = '';

    let unlocked = user.unlocked_topics || [];
    const isFull = isUserFullAccess(user);
    const q = (filterQuery || '').toLowerCase().trim();

    // Group topics by category
    const categories = ['Arithmetic', 'Speed & Work', 'Algebra & Numbers', 'Geometry & Mensuration', 'Logical Reasoning', 'Data Interpretation'];

    categories.forEach(cat => {
        const catTopics = ALL_TOPICS.filter(t => t.category === cat && (!q || t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)));
        if (catTopics.length === 0) return;

        const catHeader = document.createElement('div');
        catHeader.className = 'topic-category-header';
        catHeader.textContent = cat;
        topicsGrid.appendChild(catHeader);

        catTopics.forEach(topic => {
            const isUnlocked = isFull || unlocked.includes(topic.id);
            const div = document.createElement('div');
            div.className = 'topic-toggle ' + (isUnlocked ? 'unlocked' : '');
            div.textContent = (isUnlocked ? '✓ ' : '+ ') + topic.name;

            div.onclick = async () => {
                let currentUnlocked = [...(user.unlocked_topics || [])];
                
                // If user currently had wildcard '*', expand it to explicit IDs first
                if (currentUnlocked.includes('*')) {
                    currentUnlocked = ALL_TOPICS.map(t => t.id);
                }

                if (currentUnlocked.includes(topic.id)) {
                    currentUnlocked = currentUnlocked.filter(t => t !== topic.id && t !== '*');
                    div.classList.remove('unlocked');
                    div.textContent = '+ ' + topic.name;
                } else {
                    currentUnlocked.push(topic.id);
                    div.classList.add('unlocked');
                    div.textContent = '✓ ' + topic.name;
                }

                user.unlocked_topics = currentUnlocked;
                await db.from('user_progress').update({ unlocked_topics: currentUnlocked }).eq('user_id', user.user_id);
                updateKPIs();
                renderUsers(currentUsersList);
                openAdvancedModal(user);
            };
            topicsGrid.appendChild(div);
        });
    });
}

// Export CSV
const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (currentUsersList.length === 0) return;
        let csv = 'User ID,Email,Created At,XP,Streak,Access Level,Admin,Banned,Diagnostic Completed,Unlocked Topics\n';
        currentUsersList.forEach(u => {
            const isFull = isUserFullAccess(u);
            const accessLevel = isFull ? 'FULL ACCESS' : ((u.unlocked_topics || []).length >= 2 ? 'PREMIUM' : 'FREE');
            const row = [
                `"${u.user_id}"`,
                `"${u.email || ''}"`,
                `"${u.created_at || ''}"`,
                u.xp || 0,
                u.streak || 0,
                `"${accessLevel}"`,
                u.is_admin || false,
                u.is_banned || false,
                u.has_completed_diagnostic || false,
                `"${(u.unlocked_topics || []).join(';')}"`
            ];
            csv += row.join(',') + '\n';
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'crm_users.csv';
        a.click();
    });
}

const closeAdvancedModal = document.getElementById('close-advanced-modal');
if (closeAdvancedModal) {
    closeAdvancedModal.addEventListener('click', () => {
        const advancedModal = document.getElementById('advanced-modal');
        if (advancedModal) advancedModal.classList.add('hidden');
    });
}

function renderChart(user) {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (window.performanceChartInstance) {
        window.performanceChartInstance.destroy();
    }

    let labels = ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Wk5'];
    let predictedData = [20, 35, 50, 65, 80];
    let actualData = [15, 40, 45, 70, 75];

    if (user.quiz_results && user.quiz_results.length > 0) {
        labels = user.quiz_results.map((_, i) => 'Q' + (i+1));
        let runningAcc = 0;
        actualData = user.quiz_results.map((r, i) => {
            runningAcc += r.correct ? 1 : 0;
            return Math.round((runningAcc / (i+1)) * 100);
        });
        predictedData = actualData.map(a => a + (Math.random()*10 - 5));
    } else {
        predictedData = [20, 40, 50, 70, 85];
        actualData = [10, 35, 40, 65, 90];
    }

    window.performanceChartInstance = new Chart(ctx, {
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
            plugins: { legend: { labels: { color: '#94A3B8' } } },
            scales: {
                y: {
                    beginAtZero: true, max: 100,
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

// ================= BULK EMAIL SYNC FROM SUPABASE AUTH =================

const SYNC_SQL_SCRIPT = `-- 1. Sync all existing users' emails from auth.users:
UPDATE public.user_progress up
SET email = au.email
FROM auth.users au
WHERE up.user_id = au.id
  AND (up.email IS NULL OR up.email = '');

-- 2. Permanent trigger for future user sign-ups:
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_progress (
    user_id,
    email,
    has_completed_diagnostic,
    xp,
    streak,
    hearts,
    confidence_states,
    topic_progress,
    unlocked_topics
  )
  VALUES (
    new.id,
    new.email,
    false,
    0,
    1,
    5,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::text[]
  )
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Expose 1-click sync RPC function:
CREATE OR REPLACE FUNCTION public.sync_all_user_emails()
RETURNS json AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.user_progress up
  SET email = au.email
  FROM auth.users au
  WHERE up.user_id = au.id
    AND (up.email IS NULL OR up.email = '');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('success', true, 'updated_count', updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.sync_all_user_emails() TO anon, authenticated, service_role;`;

function openSyncModal() {
    const modal = document.getElementById('sync-modal');
    if (!modal) return;
    const codeEl = document.getElementById('sync-sql-code');
    if (codeEl) codeEl.textContent = SYNC_SQL_SCRIPT;
    
    const keyInput = document.getElementById('input-service-key');
    if (keyInput) {
        keyInput.value = localStorage.getItem('laqutum_crm_service_key') || (typeof SUPABASE_SERVICE_ROLE_KEY !== 'undefined' ? SUPABASE_SERVICE_ROLE_KEY : '');
    }
    
    modal.classList.remove('hidden');
}

function closeSyncModal() {
    const modal = document.getElementById('sync-modal');
    if (modal) modal.classList.add('hidden');
}

function copySyncSqlToClipboard() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(SYNC_SQL_SCRIPT).then(() => {
            handleCopiedFeedback();
        }).catch(() => fallbackCopyText());
    } else {
        fallbackCopyText();
    }
}

function fallbackCopyText() {
    const textarea = document.createElement('textarea');
    textarea.value = SYNC_SQL_SCRIPT;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        handleCopiedFeedback();
    } catch (e) {
        showToast('❌ Please copy manually from the box.', true);
    }
    document.body.removeChild(textarea);
}

function handleCopiedFeedback() {
    const copyBtn = document.getElementById('copy-sql-btn');
    if (copyBtn) {
        const orig = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        copyBtn.style.background = '#10B981';
        setTimeout(() => {
            copyBtn.textContent = orig;
            copyBtn.style.background = '#8B5CF6';
        }, 2000);
    }
    showToast('📋 SQL script copied to clipboard!');
}

async function handleSyncEmailsClick() {
    // 1. Check if stored service key exists in localStorage or config
    const storedKey = localStorage.getItem('laqutum_crm_service_key') || (typeof SUPABASE_SERVICE_ROLE_KEY !== 'undefined' ? SUPABASE_SERVICE_ROLE_KEY : '');
    if (storedKey && storedKey.trim()) {
        await syncEmailsViaSecretKey(storedKey.trim());
        return;
    }

    // 2. Try calling RPC function sync_all_user_emails if SQL script was already executed
    try {
        const { data, error } = await db.rpc('sync_all_user_emails');
        if (!error && data && data.success) {
            showToast(`✅ Successfully synced ${data.updated_count || 0} user emails via Database!`);
            await loadUsers();
            return;
        }
    } catch (e) {
        // RPC not available yet
    }

    // 3. Open the Sync Modal
    openSyncModal();
}

async function syncEmailsViaSecretKey(serviceKey) {
    if (!serviceKey || !serviceKey.trim()) {
        showToast('❌ Please paste a valid secret / service_role key.', true);
        return;
    }
    const key = serviceKey.trim();
    showToast('⏳ Connecting to Supabase Auth API...');

    try {
        const adminDb = window.supabase.createClient(SUPABASE_URL, key, {
            auth: { persistSession: false }
        });

        const { data, error } = await adminDb.auth.admin.listUsers({ perPage: 1000 });
        if (error) {
            throw new Error(error.message);
        }

        const authUsers = (data && data.users) ? data.users : [];
        if (authUsers.length === 0) {
            showToast('⚠️ No users found in Supabase Auth.');
            return;
        }

        let updatedCount = 0;
        for (const u of authUsers) {
            if (!u.email) continue;
            const existing = currentUsersList.find(x => x.user_id === u.id);
            if (!existing || !existing.email || existing.email !== u.email) {
                await adminDb.from('user_progress').upsert({
                    user_id: u.id,
                    email: u.email
                }, { onConflict: 'user_id' });
                updatedCount++;
            }
        }

        localStorage.setItem('laqutum_crm_service_key', key);
        showToast(`✅ Successfully synced ${updatedCount} user emails from Supabase Auth!`);
        closeSyncModal();
        await loadUsers();
    } catch (err) {
        console.error('Service key sync error:', err);
        showToast('❌ Sync failed: ' + err.message, true);
    }
}

