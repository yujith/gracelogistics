// ============================================
// Grace Logistics – Admin Dashboard Application
// Powered by Supabase
// ============================================

(function () {
    'use strict';

    const SUPABASE_URL = 'https://cxyxqntkoknanozcxpur.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4eXhxbnRrb2tuYW5vemN4cHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM5NTMsImV4cCI6MjA4NzIwOTk1M30.yHWhSIdow33yloTg2jf57U9C1TUJ_-rOYokYm8gGNRM';

    let CONTAINER_LABELS = {};
    let TIER_LABELS = {};
    let containerTypesData = [];
    let pricingTiersData = [];
    let commodityTypesData = [];
    let portsTableData = [];

    let supabase = null;
    let currentAdmin = null;
    let portsCache = [];
    let ratesData = [];
    let usersData = [];
    let csvParsedData = null;


    // ─── Init ───
    async function init() {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { storageKey: 'sb-admin-auth-token' }
            });
        } catch (e) {
            console.error('Supabase init failed:', e);
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await checkAdmin(session);
        }

        bindLoginEvents();
    }

    async function checkAdmin(session) {
        if (!session?.user) return false;
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profile && profile.role === 'admin') {
            currentAdmin = { ...session.user, profile };
            showDashboard();
            return true;
        } else {
            document.getElementById('loginError').textContent = 'Access denied. Admin role required.';
            await supabase.auth.signOut();
            return false;
        }
    }

    function showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').style.display = 'flex';
        document.getElementById('adminEmailDisplay').textContent = currentAdmin.email;
        loadLookupData().then(() => {
            loadDashboard();
            loadRates();
            loadUsers();
            loadAuditLog();
            loadPortsTable();
            loadContainerTypes();
            loadCommodityTypes();
            loadPricingTiers();
            loadPlatformSettings();
        });
        bindDashboardEvents();
    }

    async function loadLookupData() {
        await loadPorts();
        // Load container types and tiers for dropdowns
        try {
            const [ctRes, tierRes] = await Promise.all([
                supabase.from('container_types').select('*').order('sort_order'),
                supabase.from('pricing_tiers').select('*').order('sort_order')
            ]);
            containerTypesData = ctRes.data || [];
            pricingTiersData = tierRes.data || [];
            containerTypesData.forEach(c => { CONTAINER_LABELS[c.name] = c.label; });
            pricingTiersData.forEach(t => { TIER_LABELS[t.name] = t.label; });
            populateDynamicDropdowns();
        } catch (e) {
            console.error('Load lookup data error:', e);
        }
    }

    function populateDynamicDropdowns() {
        // Container type dropdowns
        const rateContainer = document.getElementById('rateContainer');
        rateContainer.innerHTML = '<option value="">Select...</option>';
        containerTypesData.filter(c => c.active).forEach(c => {
            rateContainer.innerHTML += `<option value="${c.name}">${c.label}</option>`;
        });

        // Tier dropdowns
        const tierSelects = [document.getElementById('rateTier'), document.getElementById('userFormTier'), document.getElementById('filterTier')];
        tierSelects.forEach(sel => {
            const placeholder = sel.id === 'filterTier' ? '<option value="">All Tiers</option>' : '';
            sel.innerHTML = placeholder;
            pricingTiersData.filter(t => t.active).forEach(t => {
                sel.innerHTML += `<option value="${t.name}">${t.label}</option>`;
            });
        });
    }

    // ─── Login Events ───
    function bindLoginEvents() {
        document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;
            const errorEl = document.getElementById('loginError');
            const btn = document.getElementById('btnAdminLogin');

            if (!email || !password) {
                errorEl.textContent = 'Please fill in all fields.';
                return;
            }

            toggleBtnLoading(btn, true);
            errorEl.textContent = '';

            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                const isAdmin = await checkAdmin(data.session);
                if (!isAdmin) {
                    errorEl.textContent = 'Access denied. Admin role required.';
                }
            } catch (err) {
                errorEl.textContent = err.message || 'Login failed.';
            }

            toggleBtnLoading(btn, false);
        });
    }

    // ─── Dashboard Events ───
    function bindDashboardEvents() {
        // Sidebar navigation
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                switchSection(section);
                // Close mobile sidebar
                document.getElementById('sidebar').classList.remove('open');
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) overlay.classList.remove('active');
            });
        });

        // Logout
        const logoutHandler = async () => {
            await supabase.auth.signOut();
            currentAdmin = null;
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('loginScreen').style.display = '';
            document.getElementById('loginError').textContent = '';
        };

        document.getElementById('btnDashboardLogout').addEventListener('click', logoutHandler);
        document.getElementById('mobileLogout').addEventListener('click', logoutHandler);

        // Mobile sidebar
        document.getElementById('mobileSidebarToggle').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('open');
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                document.body.appendChild(overlay);
                overlay.addEventListener('click', () => {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                });
            }
            overlay.classList.toggle('active');
        });

        // Rate CRUD
        document.getElementById('btnNewRate').addEventListener('click', () => openRateModal());
        document.getElementById('rateModalClose').addEventListener('click', closeRateModal);
        document.getElementById('rateModalCancel').addEventListener('click', closeRateModal);
        document.getElementById('rateFormEl').addEventListener('submit', handleRateSave);

        // User CRUD
        document.getElementById('btnNewUser').addEventListener('click', () => openUserModal());
        document.getElementById('userModalClose').addEventListener('click', closeUserModal);
        document.getElementById('userModalCancel').addEventListener('click', closeUserModal);
        document.getElementById('userFormEl').addEventListener('submit', handleUserSave);

        // Port CRUD
        document.getElementById('btnNewPort').addEventListener('click', () => openPortModal());
        document.getElementById('portModalClose').addEventListener('click', closePortModal);
        document.getElementById('portModalCancel').addEventListener('click', closePortModal);
        document.getElementById('portFormEl').addEventListener('submit', handlePortSave);

        // Container Type CRUD
        document.getElementById('btnNewContainerType').addEventListener('click', () => openCtModal());
        document.getElementById('ctModalClose').addEventListener('click', closeCtModal);
        document.getElementById('ctModalCancel').addEventListener('click', closeCtModal);
        document.getElementById('ctFormEl').addEventListener('submit', handleCtSave);

        // Commodity Type CRUD
        document.getElementById('btnNewCommodityType').addEventListener('click', () => openComModal());
        document.getElementById('comModalClose').addEventListener('click', closeComModal);
        document.getElementById('comModalCancel').addEventListener('click', closeComModal);
        document.getElementById('comFormEl').addEventListener('submit', handleComSave);

        // Platform Settings
        document.getElementById('btnSaveBlFee').addEventListener('click', () => {
            const val = document.getElementById('settingBlFee').value;
            if (val === '' || isNaN(parseFloat(val))) { showToast('Please enter a valid number', 'error'); return; }
            saveSetting('bl_fee', parseFloat(val).toFixed(2), 'settingsMsg');
        });
        document.getElementById('btnSaveContactEmail').addEventListener('click', () => {
            const raw = document.getElementById('settingContactEmail').value;
            const emails = raw.split('\n').map(e => e.trim()).filter(e => e.length > 0);
            const invalid = emails.filter(e => !e.includes('@') || !e.includes('.'));
            if (emails.length === 0) { showToast('Please enter at least one email address', 'error'); return; }
            if (invalid.length > 0) { showToast(`Invalid email: ${invalid[0]}`, 'error'); return; }
            // Store as comma-separated; display back as one-per-line
            saveSetting('contact_email', emails.join(','), 'settingsEmailMsg');
        });

        document.getElementById('btnSaveNewUserEmail').addEventListener('click', () => {
            const raw = document.getElementById('settingNewUserEmail').value;
            const emails = raw.split('\n').map(e => e.trim()).filter(e => e.length > 0);
            const invalid = emails.filter(e => !e.includes('@') || !e.includes('.'));
            if (emails.length === 0) { showToast('Please enter at least one email address', 'error'); return; }
            if (invalid.length > 0) { showToast(`Invalid email: ${invalid[0]}`, 'error'); return; }
            // Store as comma-separated; display back as one-per-line
            saveSetting('new_user_email', emails.join(','), 'settingsNewUserMsg');
        });

        // Pricing Tier CRUD
        document.getElementById('btnNewTier').addEventListener('click', () => openTierModal());
        document.getElementById('tierModalClose').addEventListener('click', closeTierModal);
        document.getElementById('tierModalCancel').addEventListener('click', closeTierModal);
        document.getElementById('tierFormEl').addEventListener('submit', handleTierSave);

        // CSV Download
        document.getElementById('btnCsvDownload').addEventListener('click', downloadRatesCsv);

        // CSV Upload
        document.getElementById('btnCsvUpload').addEventListener('click', openCsvModal);
        document.getElementById('csvModalClose').addEventListener('click', closeCsvModal);
        document.getElementById('csvModalCancel').addEventListener('click', closeCsvModal);
        document.getElementById('btnCsvImport').addEventListener('click', handleCsvImport);

        // Audit Detail Modal
        document.getElementById('auditDetailClose').addEventListener('click', closeAuditDetailModal);
        document.getElementById('auditDetailDismiss').addEventListener('click', closeAuditDetailModal);

        const csvFile = document.getElementById('csvFile');
        const csvDropzone = document.getElementById('csvDropzone');

        csvFile.addEventListener('change', (e) => {
            if (e.target.files[0]) parseCsvFile(e.target.files[0]);
        });

        csvDropzone.addEventListener('click', () => csvFile.click());
        csvDropzone.addEventListener('dragover', (e) => { e.preventDefault(); csvDropzone.classList.add('dragover'); });
        csvDropzone.addEventListener('dragleave', () => csvDropzone.classList.remove('dragover'));
        csvDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            csvDropzone.classList.remove('dragover');
            if (e.dataTransfer.files[0]) parseCsvFile(e.dataTransfer.files[0]);
        });

        // Rate filters
        ['filterOrigin', 'filterDest', 'filterTier', 'filterActive'].forEach(id => {
            document.getElementById(id).addEventListener('change', applyRateFilters);
        });
        document.getElementById('btnClearFilters').addEventListener('click', () => {
            ['filterOrigin', 'filterDest', 'filterTier', 'filterActive'].forEach(id => {
                document.getElementById(id).value = '';
            });
            renderRatesTable(ratesData);
        });

        // Close modals on overlay
        ['rateModal', 'userModal', 'csvModal', 'portModal', 'ctModal', 'comModal', 'tierModal'].forEach(id => {
            document.getElementById(id).addEventListener('click', (e) => {
                if (e.target.id === id) {
                    document.getElementById(id).classList.remove('active');
                }
            });
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeRateModal();
                closeUserModal();
                closeCsvModal();
                closePortModal();
                closeCtModal();
                closeComModal();
                closeTierModal();
            }
        });
    }

    function switchSection(name) {
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
        document.getElementById(`section-${name}`).classList.add('active');
        document.querySelector(`[data-section="${name}"]`).classList.add('active');
    }

    // ─── Load Data ───
    async function loadPorts() {
        const { data } = await supabase.from('ports').select('id, name, country, port_code').order('name');
        portsCache = data || [];
        populatePortDropdowns();
    }

    function populatePortDropdowns() {
        const originFilter = document.getElementById('filterOrigin');
        const destFilter = document.getElementById('filterDest');
        const rateOrigin = document.getElementById('rateOrigin');
        const rateDest = document.getElementById('rateDest');

        [originFilter, destFilter].forEach(sel => {
            const val = sel.value;
            sel.innerHTML = sel === originFilter ? '<option value="">All Origins</option>' : '<option value="">All Destinations</option>';
            portsCache.forEach(p => {
                sel.innerHTML += `<option value="${p.id}">${p.name}, ${p.country}</option>`;
            });
            sel.value = val;
        });

        [rateOrigin, rateDest].forEach(sel => {
            sel.innerHTML = '<option value="">Select port...</option>';
            portsCache.forEach(p => {
                sel.innerHTML += `<option value="${p.id}">${p.name}, ${p.country} (${p.port_code || ''})</option>`;
            });
        });
    }

    async function loadDashboard() {
        try {
            const [ratesRes, activeRes, usersRes, portsRes] = await Promise.all([
                supabase.from('rates').select('id', { count: 'exact', head: true }),
                supabase.from('rates').select('id', { count: 'exact', head: true }).eq('active', true),
                supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
                supabase.from('ports').select('id', { count: 'exact', head: true })
            ]);
            document.getElementById('statTotalRates').textContent = ratesRes.count || 0;
            document.getElementById('statActiveRates').textContent = activeRes.count || 0;
            document.getElementById('statUsers').textContent = usersRes.count || 0;
            document.getElementById('statPorts').textContent = portsRes.count || 0;
        } catch (e) {
            console.error('Dashboard stats error:', e);
        }
    }

    async function loadRates() {
        try {
            const { data, error } = await supabase
                .from('rates')
                .select(`
                    *,
                    origin:ports!rates_origin_id_fkey(name, country, port_code),
                    destination:ports!rates_destination_id_fkey(name, country, port_code)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            ratesData = data || [];
            renderRatesTable(ratesData);
        } catch (e) {
            console.error('Load rates error:', e);
            document.getElementById('ratesTableBody').innerHTML = '<tr><td colspan="10" class="table-empty">Failed to load rates.</td></tr>';
        }
    }

    async function loadUsers() {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            usersData = data || [];
            renderUsersTable(usersData);
        } catch (e) {
            console.error('Load users error:', e);
        }
    }

    async function loadAuditLog() {
        try {
            const { data, error } = await supabase
                .from('audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            renderAuditTable(data || []);
        } catch (e) {
            console.error('Load audit error:', e);
        }
    }

    // ─── Render Tables ───
    function renderRatesTable(rates) {
        const tbody = document.getElementById('ratesTableBody');
        if (!rates || rates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No rates found.</td></tr>';
            return;
        }

        tbody.innerHTML = rates.map(r => `
            <tr>
                <td>${r.origin?.name || 'N/A'}<br><small style="color:#94a3b8">${r.origin?.country || ''}</small></td>
                <td>${r.destination?.name || 'N/A'}<br><small style="color:#94a3b8">${r.destination?.country || ''}</small></td>
                <td>${CONTAINER_LABELS[r.container_type] || r.container_type}</td>
                <td><span class="tier-badge tier-${r.pricing_tier}">${TIER_LABELS[r.pricing_tier] || r.pricing_tier}</span></td>
                <td><strong>$${parseFloat(r.rate_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                <td>${r.transit_time || '—'}</td>
                <td>${formatDate(r.valid_from)}</td>
                <td>${formatDate(r.valid_to)}</td>
                <td><span class="status-tag ${r.active ? 'status-active' : 'status-inactive'}">${r.active ? '● Active' : '● Inactive'}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editRate('${r.id}')">Edit</button>
                        <button class="table-btn table-btn-dup" onclick="window._adminApp.dupRate('${r.id}')">Dup</button>
                        <button class="table-btn table-btn-del" onclick="window._adminApp.deleteRate('${r.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No users found.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || '<span style="color:#64748b">—</span>';
            return `
            <tr>
                <td>${fullName}</td>
                <td>${u.email}</td>
                <td>${u.company || '<span style="color:#64748b">—</span>'}</td>
                <td>${u.business_registration_number || '<span style="color:#64748b">—</span>'}</td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td><span class="tier-badge tier-${u.pricing_tier}">${TIER_LABELS[u.pricing_tier] || u.pricing_tier}</span></td>
                <td><span class="status-tag ${u.active ? 'status-active' : 'status-inactive'}">${u.active ? '● Active' : '● Inactive'}</span></td>
                <td>${formatDate(u.created_at)}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editUser('${u.id}')">Edit</button>
                    </div>
                </td>
            </tr>
        `}).join('');
    }

    function renderAuditTable(logs) {
        const tbody = document.getElementById('auditTableBody');
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No audit logs yet.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => {
            const performerDisplay = l.performed_by_email || 'System';
            return `
            <tr>
                <td>${new Date(l.created_at).toLocaleString()}</td>
                <td><span class="tier-badge tier-public">${l.table_name}</span></td>
                <td><strong>${l.action}</strong></td>
                <td><small>${(l.record_id || '').substring(0, 8)}...</small></td>
                <td>${performerDisplay}</td>
                <td><button class="table-btn table-btn-edit" onclick="window._adminApp.viewAuditDetail('${l.id}')">View</button></td>
            </tr>
        `}).join('');
    }

    // ─── Rate CRUD ───
    function openRateModal(rate = null) {
        document.getElementById('rateModalTitle').textContent = rate ? 'Edit Rate' : 'New Rate';
        document.getElementById('rateEditId').value = rate ? rate.id : '';
        document.getElementById('rateOrigin').value = rate ? rate.origin_id : '';
        document.getElementById('rateDest').value = rate ? rate.destination_id : '';
        document.getElementById('rateContainer').value = rate ? rate.container_type : '';
        document.getElementById('rateTier').value = rate ? rate.pricing_tier : 'public';
        document.getElementById('rateValue').value = rate ? rate.rate_value : '';
        document.getElementById('rateTransit').value = rate ? (rate.transit_time || '') : '';
        document.getElementById('rateValidFrom').value = rate ? rate.valid_from : '';
        document.getElementById('rateValidTo').value = rate ? rate.valid_to : '';
        document.getElementById('rateNotes').value = rate ? (rate.notes || '') : '';
        document.getElementById('rateActive').checked = rate ? rate.active : true;
        document.getElementById('rateModal').classList.add('active');
    }

    function closeRateModal() {
        document.getElementById('rateModal').classList.remove('active');
        document.getElementById('rateFormEl').reset();
    }

    async function handleRateSave(e) {
        e.preventDefault();
        const editId = document.getElementById('rateEditId').value;
        const rateData = {
            origin_id: document.getElementById('rateOrigin').value,
            destination_id: document.getElementById('rateDest').value,
            container_type: document.getElementById('rateContainer').value,
            pricing_tier: document.getElementById('rateTier').value,
            rate_value: parseFloat(document.getElementById('rateValue').value),
            transit_time: document.getElementById('rateTransit').value || null,
            valid_from: document.getElementById('rateValidFrom').value,
            valid_to: document.getElementById('rateValidTo').value,
            notes: document.getElementById('rateNotes').value || null,
            active: document.getElementById('rateActive').checked
        };

        try {
            let result, oldData;
            if (editId) {
                // Capture old data for audit log
                const existing = ratesData.find(r => r.id === editId);
                oldData = existing ? { ...existing } : null;
                delete oldData?.origin;
                delete oldData?.destination;

                result = await supabase.from('rates').update(rateData).eq('id', editId).select();
                if (result.error) throw result.error;
                await logAudit('rates', editId, 'UPDATE', oldData, rateData);
                showToast('Rate updated successfully', 'success');
            } else {
                rateData.created_by = currentAdmin.id;
                result = await supabase.from('rates').insert(rateData).select();
                if (result.error) throw result.error;
                await logAudit('rates', result.data?.[0]?.id, 'INSERT', null, rateData);
                showToast('Rate created successfully', 'success');
            }

            closeRateModal();
            await loadRates();
            await loadDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to save rate', 'error');
        }
    }

    async function deleteRate(id) {
        if (!confirm('Are you sure you want to delete this rate?')) return;
        try {
            const existing = ratesData.find(r => r.id === id);
            const { error } = await supabase.from('rates').delete().eq('id', id);
            if (error) throw error;
            await logAudit('rates', id, 'DELETE', existing, null);
            showToast('Rate deleted', 'success');
            await loadRates();
            await loadDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to delete rate', 'error');
        }
    }

    function editRate(id) {
        const rate = ratesData.find(r => r.id === id);
        if (rate) openRateModal(rate);
    }

    function dupRate(id) {
        const rate = ratesData.find(r => r.id === id);
        if (rate) {
            const dup = { ...rate, id: null };
            openRateModal(dup);
            document.getElementById('rateEditId').value = '';
            document.getElementById('rateModalTitle').textContent = 'Duplicate Rate';
        }
    }

    // ─── User CRUD ───
    function openUserModal(user = null) {
        document.getElementById('userModalTitle').textContent = user ? 'Edit User' : 'New User';
        document.getElementById('userEditId').value = user ? user.id : '';
        document.getElementById('userFormFirstName').value = user ? (user.first_name || '') : '';
        document.getElementById('userFormLastName').value = user ? (user.last_name || '') : '';
        document.getElementById('userFormEmail').value = user ? user.email : '';
        document.getElementById('userFormPassword').value = '';
        document.getElementById('userFormCompany').value = user ? (user.company || '') : '';
        document.getElementById('userFormBusinessReg').value = user ? (user.business_registration_number || '') : '';
        document.getElementById('userFormTier').value = user ? user.pricing_tier : 'public';
        document.getElementById('userFormRole').value = user ? user.role : 'customer';
        document.getElementById('userFormActive').checked = user ? user.active : true;

        // Show/hide password field
        const pwField = document.getElementById('passwordField');
        if (user) {
            pwField.style.display = 'none';
            document.getElementById('userFormEmail').readOnly = true;
        } else {
            pwField.style.display = '';
            document.getElementById('userFormEmail').readOnly = false;
        }

        document.getElementById('userModal').classList.add('active');
    }

    function closeUserModal() {
        document.getElementById('userModal').classList.remove('active');
        document.getElementById('userFormEl').reset();
        document.getElementById('userFormEmail').readOnly = false;
    }

    async function handleUserSave(e) {
        e.preventDefault();
        const editId = document.getElementById('userEditId').value;

        if (editId) {
            // Update profile
            const updateData = {
                first_name: document.getElementById('userFormFirstName').value.trim() || null,
                last_name: document.getElementById('userFormLastName').value.trim() || null,
                pricing_tier: document.getElementById('userFormTier').value,
                role: document.getElementById('userFormRole').value,
                active: document.getElementById('userFormActive').checked,
                company: document.getElementById('userFormCompany').value.trim() || null,
                business_registration_number: document.getElementById('userFormBusinessReg').value.trim() || null
            };

            try {
                const { error } = await supabase.from('profiles').update(updateData).eq('id', editId);
                if (error) throw error;
                await logAudit('profiles', editId, 'UPDATE', null, updateData);
                showToast('User updated successfully', 'success');
                closeUserModal();
                await loadUsers();
            } catch (err) {
                showToast(err.message || 'Failed to update user', 'error');
            }
        } else {
            // Create new user via Supabase Auth
            const email = document.getElementById('userFormEmail').value.trim();
            const password = document.getElementById('userFormPassword').value;
            const tier = document.getElementById('userFormTier').value;
            const role = document.getElementById('userFormRole').value;
            const company = document.getElementById('userFormCompany').value.trim();
            const firstName = document.getElementById('userFormFirstName').value.trim();
            const lastName = document.getElementById('userFormLastName').value.trim();
            const businessReg = document.getElementById('userFormBusinessReg').value.trim();

            if (!email || !password || password.length < 6) {
                showToast('Email and password (min 6 chars) are required.', 'error');
                return;
            }

            try {
                // We use the admin API workaround: sign up then update profile
                const userData = { pricing_tier: tier, role: role };
                if (company) userData.company = company;
                if (firstName) userData.first_name = firstName;
                if (lastName) userData.last_name = lastName;
                if (businessReg) userData.business_registration_number = businessReg;
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: userData
                    }
                });
                if (error) throw error;

                // Sign back in as admin
                showToast('User created successfully. Email verification sent.', 'success');

                // Trigger new user notification email
                try {
                    await supabase.functions.invoke('send-new-user-email', {
                        body: {
                            email: email,
                            firstName: firstName,
                            lastName: lastName,
                            company: company,
                            businessRegistrationNumber: businessReg,
                            role: role
                        }
                    });
                } catch (emailErr) {
                    console.error('Failed to send new user notification email:', emailErr);
                }

                const btnSubmit = document.getElementById('btnUserSubmit');
                const btnText = btnSubmit ? btnSubmit.querySelector('.btn-text') : null;
                const originalText = btnText ? btnText.textContent : '';

                // Show success state on the button
                if (btnText) {
                    btnText.textContent = 'User Created! Check email';
                    btnSubmit.style.backgroundColor = '#10b981'; // Success green
                }

                // Wait 3 seconds to let user read the message
                setTimeout(() => {
                    closeUserModal();
                    if (btnText) {
                        btnText.textContent = originalText;
                        btnSubmit.style.backgroundColor = '';
                    }

                    // Wait for the trigger to create the profile, then reload
                    setTimeout(async () => {
                        await loadUsers();
                        await loadDashboard();
                    }, 500); // reduced from 2000 since we already waited 3000
                }, 3000);
            } catch (err) {
                showToast(err.message || 'Failed to create user', 'error');
            }
        }
    }

    function editUser(id) {
        const user = usersData.find(u => u.id === id);
        if (user) openUserModal(user);
    }

    // ─── CSV Download ───
    function downloadRatesCsv() {
        // Use currently filtered rates from the table, or all rates if no filter applied
        const filtered = applyRateFiltersForExport();
        if (!filtered || filtered.length === 0) {
            showToast('No rates to export.', 'error');
            return;
        }

        const headers = ['Origin', 'Origin Country', 'Origin Code', 'Destination', 'Destination Country', 'Destination Code', 'Container Type', 'Pricing Tier', 'Rate (USD)', 'Transit Time', 'Valid From', 'Valid To', 'Status'];

        const csvRows = [headers.join(',')];
        filtered.forEach(r => {
            const row = [
                escapeCsvField(r.origin?.name || ''),
                escapeCsvField(r.origin?.country || ''),
                escapeCsvField(r.origin?.port_code || ''),
                escapeCsvField(r.destination?.name || ''),
                escapeCsvField(r.destination?.country || ''),
                escapeCsvField(r.destination?.port_code || ''),
                escapeCsvField(CONTAINER_LABELS[r.container_type] || r.container_type),
                escapeCsvField(TIER_LABELS[r.pricing_tier] || r.pricing_tier),
                parseFloat(r.rate_value).toFixed(2),
                escapeCsvField(r.transit_time || ''),
                r.valid_from || '',
                r.valid_to || '',
                r.active ? 'Active' : 'Inactive'
            ];
            csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const today = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `rates_export_${today}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`${filtered.length} rates exported to CSV`, 'success');
    }

    function escapeCsvField(value) {
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    function applyRateFiltersForExport() {
        let filtered = [...ratesData];
        const origin = document.getElementById('filterOrigin').value;
        const dest = document.getElementById('filterDest').value;
        const tier = document.getElementById('filterTier').value;
        const active = document.getElementById('filterActive').value;

        if (origin) filtered = filtered.filter(r => r.origin_id === origin);
        if (dest) filtered = filtered.filter(r => r.destination_id === dest);
        if (tier) filtered = filtered.filter(r => r.pricing_tier === tier);
        if (active) filtered = filtered.filter(r => String(r.active) === active);

        return filtered;
    }

    // ─── CSV Upload ───
    function openCsvModal() {
        csvParsedData = null;
        document.getElementById('csvFile').value = '';
        document.getElementById('csvPreview').style.display = 'none';
        document.getElementById('csvErrors').style.display = 'none';
        document.getElementById('csvStatus').textContent = '';
        document.getElementById('csvStatus').className = 'csv-status';
        document.getElementById('btnCsvImport').disabled = true;
        document.getElementById('csvModal').classList.add('active');
    }

    function closeCsvModal() {
        document.getElementById('csvModal').classList.remove('active');
    }

    function isValidDate(dateStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
        const d = new Date(dateStr + 'T00:00:00');
        return !isNaN(d.getTime());
    }

    function parseCsvFile(file) {
        // Reset UI
        document.getElementById('csvPreview').style.display = 'none';
        document.getElementById('csvErrors').style.display = 'none';
        document.getElementById('csvStatus').textContent = '';
        document.getElementById('csvStatus').className = 'csv-status';
        document.getElementById('btnCsvImport').disabled = true;
        csvParsedData = null;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            showCsvErrors(['File must be a .csv file.']);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                if (lines.length < 2) {
                    showCsvErrors(['CSV must have a header row and at least one data row.']);
                    return;
                }

                const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
                const requiredHeaders = ['origin_code', 'destination_code', 'container_type', 'pricing_tier', 'rate_value', 'valid_from', 'valid_to'];
                const missing = requiredHeaders.filter(h => !headers.includes(h));

                if (missing.length > 0) {
                    showCsvErrors([`Missing required columns: ${missing.join(', ')}`]);
                    return;
                }

                // Build lookup maps for validation
                const portCodeMap = {};
                portsCache.forEach(p => {
                    if (p.port_code) portCodeMap[p.port_code.toUpperCase()] = p.id;
                });
                const validContainerTypes = new Set(containerTypesData.filter(c => c.active).map(c => c.name));
                const validTiers = new Set(pricingTiersData.filter(t => t.active).map(t => t.name));

                const rows = [];
                const errors = [];
                const seenRows = new Set();

                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',').map(v => v.trim());
                    const row = {};
                    headers.forEach((h, idx) => row[h] = values[idx] || '');
                    const rowNum = i + 1;

                    // --- Validate each field ---
                    const originCode = (row.origin_code || '').toUpperCase();
                    const destCode = (row.destination_code || '').toUpperCase();
                    const containerType = row.container_type || '';
                    const pricingTier = row.pricing_tier || '';
                    const rateValueRaw = row.rate_value || '';
                    const validFrom = row.valid_from || '';
                    const validTo = row.valid_to || '';

                    // Origin port
                    if (!originCode) {
                        errors.push(`Row ${rowNum}: origin_code is empty`);
                    } else if (!portCodeMap[originCode]) {
                        errors.push(`Row ${rowNum}: Unknown origin port code "${row.origin_code}"`);
                    }

                    // Destination port
                    if (!destCode) {
                        errors.push(`Row ${rowNum}: destination_code is empty`);
                    } else if (!portCodeMap[destCode]) {
                        errors.push(`Row ${rowNum}: Unknown destination port code "${row.destination_code}"`);
                    }

                    // Same origin and destination
                    if (originCode && destCode && originCode === destCode) {
                        errors.push(`Row ${rowNum}: Origin and destination cannot be the same ("${row.origin_code}")`);
                    }

                    // Container type
                    if (!containerType) {
                        errors.push(`Row ${rowNum}: container_type is empty`);
                    } else if (!validContainerTypes.has(containerType)) {
                        errors.push(`Row ${rowNum}: Invalid container type "${containerType}". Valid: ${[...validContainerTypes].join(', ')}`);
                    }

                    // Pricing tier
                    if (!pricingTier) {
                        errors.push(`Row ${rowNum}: pricing_tier is empty`);
                    } else if (!validTiers.has(pricingTier)) {
                        errors.push(`Row ${rowNum}: Invalid pricing tier "${pricingTier}". Valid: ${[...validTiers].join(', ')}`);
                    }

                    // Rate value
                    const rateValue = parseFloat(rateValueRaw);
                    if (!rateValueRaw) {
                        errors.push(`Row ${rowNum}: rate_value is empty`);
                    } else if (isNaN(rateValue)) {
                        errors.push(`Row ${rowNum}: rate_value "${rateValueRaw}" is not a valid number`);
                    } else if (rateValue <= 0) {
                        errors.push(`Row ${rowNum}: rate_value must be a positive number (got ${rateValue})`);
                    }

                    // Valid from date
                    if (!validFrom) {
                        errors.push(`Row ${rowNum}: valid_from is empty`);
                    } else if (!isValidDate(validFrom)) {
                        errors.push(`Row ${rowNum}: valid_from "${validFrom}" is not a valid date (use YYYY-MM-DD)`);
                    }

                    // Valid to date
                    if (!validTo) {
                        errors.push(`Row ${rowNum}: valid_to is empty`);
                    } else if (!isValidDate(validTo)) {
                        errors.push(`Row ${rowNum}: valid_to "${validTo}" is not a valid date (use YYYY-MM-DD)`);
                    }

                    // Date order
                    if (isValidDate(validFrom) && isValidDate(validTo) && validFrom > validTo) {
                        errors.push(`Row ${rowNum}: valid_from (${validFrom}) is after valid_to (${validTo})`);
                    }

                    // Duplicate check within file
                    const dedupeKey = `${originCode}|${destCode}|${containerType}|${pricingTier}|${validFrom}|${validTo}`;
                    if (seenRows.has(dedupeKey)) {
                        errors.push(`Row ${rowNum}: Duplicate of another row in this file (same origin, destination, container, tier, and dates)`);
                    }
                    seenRows.add(dedupeKey);

                    rows.push(row);
                }

                // If ANY errors, fail the entire upload
                if (errors.length > 0) {
                    showCsvErrors(errors);
                    return;
                }

                csvParsedData = rows;

                // Show preview
                const previewEl = document.getElementById('csvPreview');
                const tableEl = document.getElementById('csvPreviewTable');
                document.getElementById('csvPreviewTitle').textContent = `Preview (${rows.length} rows)`;

                const displayHeaders = requiredHeaders.concat(headers.includes('transit_time') ? ['transit_time'] : []);
                let previewHtml = '<table><thead><tr>';
                displayHeaders.forEach(h => previewHtml += `<th>${h}</th>`);
                previewHtml += '</tr></thead><tbody>';
                rows.slice(0, 5).forEach(row => {
                    previewHtml += '<tr>';
                    displayHeaders.forEach(h => previewHtml += `<td>${row[h] || ''}</td>`);
                    previewHtml += '</tr>';
                });
                if (rows.length > 5) {
                    previewHtml += `<tr><td colspan="${displayHeaders.length}" style="text-align:center;color:#94a3b8">... and ${rows.length - 5} more rows</td></tr>`;
                }
                previewHtml += '</tbody></table>';
                tableEl.innerHTML = previewHtml;
                previewEl.style.display = 'block';

                document.getElementById('csvStatus').textContent = `✓ ${rows.length} rates validated and ready to import.`;
                document.getElementById('csvStatus').className = 'csv-status success';
                document.getElementById('btnCsvImport').disabled = false;
            } catch (err) {
                showCsvErrors(['Failed to parse CSV: ' + err.message]);
            }
        };
        reader.readAsText(file);
    }

    function showCsvErrors(errors) {
        const errorsEl = document.getElementById('csvErrors');
        const listEl = document.getElementById('csvErrorList');
        const countEl = document.getElementById('csvErrorCount');

        countEl.textContent = `Validation Failed — ${errors.length} error${errors.length > 1 ? 's' : ''} found`;
        listEl.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
        errorsEl.style.display = 'block';

        document.getElementById('csvPreview').style.display = 'none';
        document.getElementById('csvStatus').textContent = 'Upload blocked. Fix all errors and re-upload.';
        document.getElementById('csvStatus').className = 'csv-status error';
        document.getElementById('btnCsvImport').disabled = true;
        csvParsedData = null;
    }

    async function handleCsvImport() {
        if (!csvParsedData || csvParsedData.length === 0) return;

        const statusEl = document.getElementById('csvStatus');
        const btn = document.getElementById('btnCsvImport');
        btn.disabled = true;
        statusEl.textContent = 'Importing...';
        statusEl.className = 'csv-status';

        const portCodeMap = {};
        portsCache.forEach(p => {
            if (p.port_code) portCodeMap[p.port_code.toUpperCase()] = p.id;
        });

        const ratesToInsert = csvParsedData.map(row => ({
            origin_id: portCodeMap[row.origin_code.toUpperCase()],
            destination_id: portCodeMap[row.destination_code.toUpperCase()],
            container_type: row.container_type,
            pricing_tier: row.pricing_tier,
            rate_value: parseFloat(row.rate_value),
            transit_time: row.transit_time || null,
            valid_from: row.valid_from,
            valid_to: row.valid_to,
            active: true,
            created_by: currentAdmin.id
        }));

        try {
            const { error } = await supabase.from('rates').insert(ratesToInsert);
            if (error) throw error;

            statusEl.textContent = `✓ Successfully imported ${ratesToInsert.length} rates!`;
            statusEl.className = 'csv-status success';
            showToast(`${ratesToInsert.length} rates imported`, 'success');

            await loadRates();
            await loadDashboard();

            setTimeout(closeCsvModal, 2000);
        } catch (err) {
            statusEl.textContent = 'Import failed: ' + err.message;
            statusEl.className = 'csv-status error';
            btn.disabled = false;
        }
    }

    // ─── Audit Log ───
    async function logAudit(tableName, recordId, action, oldData, newData) {
        try {
            await supabase.from('audit_log').insert({
                table_name: tableName,
                record_id: recordId,
                action: action,
                old_data: oldData,
                new_data: newData,
                performed_by: currentAdmin.id,
                performed_by_email: currentAdmin.email
            });
        } catch (e) {
            console.error('Audit log error:', e);
        }
    }

    function viewAuditDetail(id) {
        supabase.from('audit_log').select('*').eq('id', id).single().then(({ data }) => {
            if (!data) return;

            const actionClass = {
                'UPDATE': 'audit-action-update',
                'INSERT': 'audit-action-insert',
                'DELETE': 'audit-action-delete'
            }[data.action] || 'audit-action-update';

            const actionIcon = {
                'UPDATE': '✏️',
                'INSERT': '➕',
                'DELETE': '🗑️'
            }[data.action] || '📋';

            const timestamp = new Date(data.created_at).toLocaleString('en-US', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            // Build metadata section
            let html = `
                <div class="audit-detail-meta">
                    <div class="audit-meta-item">
                        <span class="audit-meta-label">Action</span>
                        <span class="audit-meta-value"><span class="audit-action-badge ${actionClass}">${actionIcon} ${data.action}</span></span>
                    </div>
                    <div class="audit-meta-item">
                        <span class="audit-meta-label">Table</span>
                        <span class="audit-meta-value"><span class="audit-table-badge">${data.table_name}</span></span>
                    </div>
                    <div class="audit-meta-item">
                        <span class="audit-meta-label">Timestamp</span>
                        <span class="audit-meta-value">${timestamp}</span>
                    </div>
                    <div class="audit-meta-item">
                        <span class="audit-meta-label">Performed By</span>
                        <span class="audit-meta-value">${data.performed_by_email || 'System'}</span>
                    </div>
                    <div class="audit-meta-item" style="grid-column: 1 / -1;">
                        <span class="audit-meta-label">Record ID</span>
                        <span class="audit-meta-value"><span class="audit-record-id">${data.record_id || '—'}</span></span>
                    </div>
                </div>
                <div class="audit-divider"></div>
                <div class="audit-data-panels">
            `;

            function formatFieldName(key) {
                return key.replace(/_/g, ' ').replace(/\bid\b/gi, 'ID').replace(/\b\w/g, c => c.toUpperCase());
            }

            function formatFieldValue(val) {
                if (val === null || val === undefined) return '<span style="color:#94a3b8;font-style:italic;">—</span>';
                if (typeof val === 'boolean') return val ? '<span style="color:#059669;">✓ Yes</span>' : '<span style="color:#dc2626;">✗ No</span>';
                if (typeof val === 'object') return '<span style="color:#64748b;font-size:0.8rem;">' + JSON.stringify(val, null, 2).replace(/</g, '&lt;') + '</span>';
                const str = String(val);
                // Format UUID-like strings (truncate)
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(str) && str.length > 20) {
                    return '<span class="audit-record-id">' + str.substring(0, 8) + '...</span>';
                }
                // Format ISO date strings
                if (/^\d{4}-\d{2}-\d{2}(T|\s)/.test(str)) {
                    try {
                        return new Date(str).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    } catch (e) { /* fall through */ }
                }
                // Format plain dates
                if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                    return new Date(str + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                }
                // Format numbers that look like currency
                if (!isNaN(str) && str.includes('.')) {
                    return parseFloat(str).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
                return str;
            }

            function buildDataRows(obj, comparisonObj = null) {
                if (!obj || typeof obj !== 'object') return '<div class="audit-data-empty">No data recorded</div>';
                const keys = Object.keys(obj);
                if (keys.length === 0) return '<div class="audit-data-empty">No data recorded</div>';
                return '<div class="audit-data-rows">' + keys.map(key => {
                    const isChanged = comparisonObj && comparisonObj.hasOwnProperty(key) &&
                        JSON.stringify(obj[key]) !== JSON.stringify(comparisonObj[key]);
                    return `<div class="audit-data-row${isChanged ? ' changed' : ''}">
                        <span class="audit-data-key">${formatFieldName(key)}</span>
                        <span class="audit-data-val">${formatFieldValue(obj[key])}</span>
                    </div>`;
                }).join('') + '</div>';
            }

            if (data.action === 'UPDATE') {
                html += `
                    <div class="audit-data-panel">
                        <div class="audit-data-panel-header old-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                            Previous Values
                        </div>
                        ${buildDataRows(data.old_data, data.new_data)}
                    </div>
                    <div class="audit-data-panel">
                        <div class="audit-data-panel-header new-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            New Values
                        </div>
                        ${buildDataRows(data.new_data, data.old_data)}
                    </div>
                `;
            } else if (data.action === 'INSERT') {
                html += `
                    <div class="audit-data-panel">
                        <div class="audit-data-panel-header new-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Created Record
                        </div>
                        ${buildDataRows(data.new_data)}
                    </div>
                `;
            } else if (data.action === 'DELETE') {
                html += `
                    <div class="audit-data-panel">
                        <div class="audit-data-panel-header old-header">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            Deleted Record
                        </div>
                        ${buildDataRows(data.old_data)}
                    </div>
                `;
            }

            html += '</div>';

            document.getElementById('auditDetailTitle').textContent = `${data.action} — ${data.table_name}`;
            document.getElementById('auditDetailBody').innerHTML = html;
            document.getElementById('auditDetailModal').classList.add('active');
        });
    }

    function closeAuditDetailModal() {
        document.getElementById('auditDetailModal').classList.remove('active');
    }

    // ─── Filters ───
    function applyRateFilters() {
        const origin = document.getElementById('filterOrigin').value;
        const dest = document.getElementById('filterDest').value;
        const tier = document.getElementById('filterTier').value;
        const active = document.getElementById('filterActive').value;

        let filtered = [...ratesData];

        if (origin) filtered = filtered.filter(r => r.origin_id === origin);
        if (dest) filtered = filtered.filter(r => r.destination_id === dest);
        if (tier) filtered = filtered.filter(r => r.pricing_tier === tier);
        if (active !== '') filtered = filtered.filter(r => String(r.active) === active);

        renderRatesTable(filtered);
    }

    // ─── Helpers ───
    function formatDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function toggleBtnLoading(btn, loading) {
        const textSpan = btn.querySelector('.btn-text');
        const loadingSpan = btn.querySelector('.btn-loading');
        if (textSpan && loadingSpan) {
            textSpan.style.display = loading ? 'none' : 'inline';
            loadingSpan.style.display = loading ? 'inline-flex' : 'none';
        }
        btn.disabled = loading;
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = {
            success: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            error: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ─── Port CRUD ───
    async function loadPortsTable() {
        try {
            const { data, error } = await supabase.from('ports').select('*').order('name');
            if (error) throw error;
            portsTableData = data || [];
            renderPortsTable(portsTableData);
        } catch (e) {
            console.error('Load ports error:', e);
        }
    }

    function renderPortsTable(ports) {
        const tbody = document.getElementById('portsTableBody');
        if (!ports || ports.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No ports found.</td></tr>';
            return;
        }
        tbody.innerHTML = ports.map(p => `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.country}</td>
                <td>${p.port_code || '—'}</td>
                <td>${formatDate(p.created_at)}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editPort('${p.id}')">Edit</button>
                        <button class="table-btn table-btn-del" onclick="window._adminApp.deletePort('${p.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function openPortModal(port = null) {
        document.getElementById('portModalTitle').textContent = port ? 'Edit Port' : 'New Port';
        document.getElementById('portEditId').value = port ? port.id : '';
        document.getElementById('portName').value = port ? port.name : '';
        document.getElementById('portCountry').value = port ? port.country : '';
        document.getElementById('portCode').value = port ? (port.port_code || '') : '';
        document.getElementById('portModal').classList.add('active');
    }

    function closePortModal() {
        document.getElementById('portModal').classList.remove('active');
        document.getElementById('portFormEl').reset();
    }

    async function handlePortSave(e) {
        e.preventDefault();
        const editId = document.getElementById('portEditId').value;
        const portData = {
            name: document.getElementById('portName').value.trim(),
            country: document.getElementById('portCountry').value.trim(),
            port_code: document.getElementById('portCode').value.trim() || null
        };

        try {
            if (editId) {
                const { error } = await supabase.from('ports').update(portData).eq('id', editId);
                if (error) throw error;
                showToast('Port updated', 'success');
            } else {
                const { error } = await supabase.from('ports').insert(portData);
                if (error) throw error;
                showToast('Port created', 'success');
            }
            closePortModal();
            await loadPorts();
            await loadPortsTable();
            await loadDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to save port', 'error');
        }
    }

    function editPort(id) {
        const port = portsTableData.find(p => p.id === id);
        if (port) openPortModal(port);
    }

    async function deletePort(id) {
        if (!confirm('Delete this port? This may fail if rates reference it.')) return;
        try {
            const { error } = await supabase.from('ports').delete().eq('id', id);
            if (error) throw error;
            showToast('Port deleted', 'success');
            await loadPorts();
            await loadPortsTable();
            await loadDashboard();
        } catch (err) {
            showToast(err.message || 'Failed to delete port', 'error');
        }
    }

    // ─── Container Type CRUD ───
    async function loadContainerTypes() {
        try {
            const { data, error } = await supabase.from('container_types').select('*').order('sort_order');
            if (error) throw error;
            containerTypesData = data || [];
            CONTAINER_LABELS = {};
            containerTypesData.forEach(c => { CONTAINER_LABELS[c.name] = c.label; });
            renderContainerTypesTable(containerTypesData);
            populateDynamicDropdowns();
        } catch (e) {
            console.error('Load container types error:', e);
        }
    }

    function renderContainerTypesTable(types) {
        const tbody = document.getElementById('containerTypesTableBody');
        if (!types || types.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No container types found.</td></tr>';
            return;
        }
        tbody.innerHTML = types.map(t => `
            <tr>
                <td><code>${t.name}</code></td>
                <td><strong>${t.label}</strong></td>
                <td>${t.sort_order}</td>
                <td><span class="status-tag ${t.active ? 'status-active' : 'status-inactive'}">${t.active ? '● Active' : '● Inactive'}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editContainerType('${t.id}')">Edit</button>
                        <button class="table-btn table-btn-del" onclick="window._adminApp.deleteContainerType('${t.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function openCtModal(ct = null) {
        document.getElementById('ctModalTitle').textContent = ct ? 'Edit Container Type' : 'New Container Type';
        document.getElementById('ctEditId').value = ct ? ct.id : '';
        document.getElementById('ctName').value = ct ? ct.name : '';
        document.getElementById('ctLabel').value = ct ? ct.label : '';
        document.getElementById('ctSort').value = ct ? ct.sort_order : 0;
        document.getElementById('ctActive').checked = ct ? ct.active : true;
        document.getElementById('ctModal').classList.add('active');
    }

    function closeCtModal() {
        document.getElementById('ctModal').classList.remove('active');
        document.getElementById('ctFormEl').reset();
    }

    async function handleCtSave(e) {
        e.preventDefault();
        const editId = document.getElementById('ctEditId').value;
        const ctData = {
            name: document.getElementById('ctName').value.trim(),
            label: document.getElementById('ctLabel').value.trim(),
            sort_order: parseInt(document.getElementById('ctSort').value) || 0,
            active: document.getElementById('ctActive').checked
        };

        try {
            if (editId) {
                const { error } = await supabase.from('container_types').update(ctData).eq('id', editId);
                if (error) throw error;
                showToast('Container type updated', 'success');
            } else {
                const { error } = await supabase.from('container_types').insert(ctData);
                if (error) throw error;
                showToast('Container type created', 'success');
            }
            closeCtModal();
            await loadContainerTypes();
        } catch (err) {
            showToast(err.message || 'Failed to save container type', 'error');
        }
    }

    function editContainerType(id) {
        const ct = containerTypesData.find(c => c.id === id);
        if (ct) openCtModal(ct);
    }

    async function deleteContainerType(id) {
        if (!confirm('Delete this container type?')) return;
        try {
            const { error } = await supabase.from('container_types').delete().eq('id', id);
            if (error) throw error;
            showToast('Container type deleted', 'success');
            await loadContainerTypes();
        } catch (err) {
            showToast(err.message || 'Failed to delete', 'error');
        }
    }

    // ─── Pricing Tier CRUD ───
    async function loadPricingTiers() {
        try {
            const { data, error } = await supabase.from('pricing_tiers').select('*').order('sort_order');
            if (error) throw error;
            pricingTiersData = data || [];
            TIER_LABELS = {};
            pricingTiersData.forEach(t => { TIER_LABELS[t.name] = t.label; });
            renderPricingTiersTable(pricingTiersData);
            populateDynamicDropdowns();
        } catch (e) {
            console.error('Load pricing tiers error:', e);
        }
    }

    function renderPricingTiersTable(tiers) {
        const tbody = document.getElementById('pricingTiersTableBody');
        if (!tiers || tiers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No pricing tiers found.</td></tr>';
            return;
        }
        tbody.innerHTML = tiers.map(t => `
            <tr>
                <td><code>${t.name}</code></td>
                <td><strong>${t.label}</strong></td>
                <td>${t.sort_order}</td>
                <td><span class="status-tag ${t.active ? 'status-active' : 'status-inactive'}">${t.active ? '● Active' : '● Inactive'}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editTier('${t.id}')">Edit</button>
                        <button class="table-btn table-btn-del" onclick="window._adminApp.deleteTier('${t.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function openTierModal(tier = null) {
        document.getElementById('tierModalTitle').textContent = tier ? 'Edit Pricing Tier' : 'New Pricing Tier';
        document.getElementById('tierEditId').value = tier ? tier.id : '';
        document.getElementById('tierName').value = tier ? tier.name : '';
        document.getElementById('tierLabel').value = tier ? tier.label : '';
        document.getElementById('tierSort').value = tier ? tier.sort_order : 0;
        document.getElementById('tierActive').checked = tier ? tier.active : true;
        document.getElementById('tierModal').classList.add('active');
    }

    function closeTierModal() {
        document.getElementById('tierModal').classList.remove('active');
        document.getElementById('tierFormEl').reset();
    }

    async function handleTierSave(e) {
        e.preventDefault();
        const editId = document.getElementById('tierEditId').value;
        const tierData = {
            name: document.getElementById('tierName').value.trim(),
            label: document.getElementById('tierLabel').value.trim(),
            sort_order: parseInt(document.getElementById('tierSort').value) || 0,
            active: document.getElementById('tierActive').checked
        };

        try {
            if (editId) {
                const { error } = await supabase.from('pricing_tiers').update(tierData).eq('id', editId);
                if (error) throw error;
                showToast('Pricing tier updated', 'success');
            } else {
                const { error } = await supabase.from('pricing_tiers').insert(tierData);
                if (error) throw error;
                showToast('Pricing tier created', 'success');
            }
            closeTierModal();
            await loadPricingTiers();
        } catch (err) {
            showToast(err.message || 'Failed to save tier', 'error');
        }
    }

    function editTier(id) {
        const tier = pricingTiersData.find(t => t.id === id);
        if (tier) openTierModal(tier);
    }

    async function deleteTier(id) {
        if (!confirm('Delete this pricing tier?')) return;
        try {
            const { error } = await supabase.from('pricing_tiers').delete().eq('id', id);
            if (error) throw error;
            showToast('Pricing tier deleted', 'success');
            await loadPricingTiers();
        } catch (err) {
            showToast(err.message || 'Failed to delete', 'error');
        }
    }

    // ─── Commodity Type CRUD ───
    async function loadCommodityTypes() {
        try {
            const { data, error } = await supabase.from('commodity_types').select('*').order('sort_order');
            if (error) throw error;
            commodityTypesData = data || [];
            renderCommodityTypesTable(commodityTypesData);
        } catch (e) {
            console.error('Load commodity types error:', e);
        }
    }

    function renderCommodityTypesTable(types) {
        const tbody = document.getElementById('commodityTypesTableBody');
        if (!types || types.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No commodity types found.</td></tr>';
            return;
        }
        tbody.innerHTML = types.map(t => `
            <tr>
                <td><code>${t.name}</code></td>
                <td><strong>${t.label}</strong></td>
                <td>${t.sort_order}</td>
                <td><span class="status-tag ${t.active ? 'status-active' : 'status-inactive'}">${t.active ? '● Active' : '● Inactive'}</span></td>
                <td>
                    <div class="table-actions">
                        <button class="table-btn table-btn-edit" onclick="window._adminApp.editCommodityType('${t.id}')">Edit</button>
                        <button class="table-btn table-btn-del" onclick="window._adminApp.deleteCommodityType('${t.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    function openComModal(com = null) {
        document.getElementById('comModalTitle').textContent = com ? 'Edit Commodity Type' : 'New Commodity Type';
        document.getElementById('comEditId').value = com ? com.id : '';
        document.getElementById('comName').value = com ? com.name : '';
        document.getElementById('comLabel').value = com ? com.label : '';
        document.getElementById('comSort').value = com ? com.sort_order : 0;
        document.getElementById('comActive').checked = com ? com.active : true;
        document.getElementById('comModal').classList.add('active');
    }

    function closeComModal() {
        document.getElementById('comModal').classList.remove('active');
        document.getElementById('comFormEl').reset();
    }

    async function handleComSave(e) {
        e.preventDefault();
        const editId = document.getElementById('comEditId').value;
        const comData = {
            name: document.getElementById('comName').value.trim(),
            label: document.getElementById('comLabel').value.trim(),
            sort_order: parseInt(document.getElementById('comSort').value) || 0,
            active: document.getElementById('comActive').checked
        };

        try {
            if (editId) {
                const { error } = await supabase.from('commodity_types').update(comData).eq('id', editId);
                if (error) throw error;
                showToast('Commodity type updated', 'success');
            } else {
                const { error } = await supabase.from('commodity_types').insert(comData);
                if (error) throw error;
                showToast('Commodity type created', 'success');
            }
            closeComModal();
            await loadCommodityTypes();
        } catch (err) {
            showToast(err.message || 'Failed to save commodity type', 'error');
        }
    }

    function editCommodityType(id) {
        const com = commodityTypesData.find(c => c.id === id);
        if (com) openComModal(com);
    }

    async function deleteCommodityType(id) {
        if (!confirm('Delete this commodity type?')) return;
        try {
            const { error } = await supabase.from('commodity_types').delete().eq('id', id);
            if (error) throw error;
            showToast('Commodity type deleted', 'success');
            await loadCommodityTypes();
        } catch (err) {
            showToast(err.message || 'Failed to delete', 'error');
        }
    }

    // ─── Platform Settings CRUD ───
    async function loadPlatformSettings() {
        try {
            const { data, error } = await supabase.from('platform_settings').select('key, value');
            if (error) throw error;
            (data || []).forEach(s => {
                if (s.key === 'bl_fee') {
                    const el = document.getElementById('settingBlFee');
                    if (el) el.value = s.value;
                }
                if (s.key === 'contact_email') {
                    const el = document.getElementById('settingContactEmail');
                    // Stored as comma-separated; display one per line
                    if (el) el.value = s.value.split(',').map(e => e.trim()).join('\n');
                }
                if (s.key === 'new_user_email') {
                    const el = document.getElementById('settingNewUserEmail');
                    if (el) el.value = s.value.split(',').map(e => e.trim()).join('\n');
                }
            });
        } catch (e) {
            console.error('Load platform settings error:', e);
        }
    }

    async function saveSetting(key, value, msgElId) {
        const msgEl = document.getElementById(msgElId);
        try {
            const { error } = await supabase
                .from('platform_settings')
                .update({ value: String(value), updated_at: new Date().toISOString() })
                .eq('key', key);
            if (error) throw error;
            showToast('Setting saved', 'success');
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.color = '#10b981';
                msgEl.textContent = '✓ Saved successfully';
                setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
            }
        } catch (err) {
            showToast(err.message || 'Failed to save setting', 'error');
            if (msgEl) {
                msgEl.style.display = 'block';
                msgEl.style.color = '#ef4444';
                msgEl.textContent = '✗ ' + (err.message || 'Save failed');
            }
        }
    }

    // ─── Expose for inline onclick handlers ───
    window._adminApp = {
        editRate,
        dupRate,
        deleteRate,
        editUser,
        viewAuditDetail,
        editPort,
        deletePort,
        editContainerType,
        deleteContainerType,
        editCommodityType,
        deleteCommodityType,
        editTier,
        deleteTier
    };

    // ─── Start ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
