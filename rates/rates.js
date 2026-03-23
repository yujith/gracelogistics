// ============================================
// Grace Logistics – Rate Search Application
// Powered by Supabase
// ============================================

(function () {
    'use strict';

    // ─── Supabase Config ───
    // IMPORTANT: Replace these with your actual Supabase credentials
    const SUPABASE_URL = 'https://cxyxqntkoknanozcxpur.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4eXhxbnRrb2tuYW5vemN4cHVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MzM5NTMsImV4cCI6MjA4NzIwOTk1M30.yHWhSIdow33yloTg2jf57U9C1TUJ_-rOYokYm8gGNRM';

    // Dynamic labels – loaded from DB
    let CONTAINER_LABELS = {};
    let TIER_LABELS = {};
    let TIER_LIST = [];   // ordered list of tier names for fallback

    // Commodity type labels – loaded from DB
    let COMMODITY_LABELS = {};

    // ─── Platform Settings ───
    let BL_FEE = 0; // Delivery Order fee in USD, loaded from DB
    let CONTACT_EMAIL = 'niroshan.s@gracelogisticslk.com'; // fallback; replaced with DB value

    // ─── State ───
    let supabase = null;
    let currentUser = null;
    let currentProfile = null;
    let portsCache = [];
    let lastSearchParams = null;
    let originDebounce, destDebounce;

    // ─── DOM Elements ───
    const els = {};

    function initElements() {
        // Auth
        els.authBar = document.getElementById('authBar');
        els.authInfo = document.getElementById('authInfo');
        els.authActions = document.getElementById('authActions');
        els.authUser = document.getElementById('authUser');
        els.userEmail = document.getElementById('userEmail');
        els.userTier = document.getElementById('userTier');
        els.btnShowLogin = document.getElementById('btnShowLogin');
        els.btnShowSignup = document.getElementById('btnShowSignup');
        els.btnLogout = document.getElementById('btnLogout');

        // Search form
        els.searchForm = document.getElementById('rateSearchForm');
        els.originPort = document.getElementById('originPort');
        els.originPortId = document.getElementById('originPortId');
        els.originDropdown = document.getElementById('originDropdown');
        els.destPort = document.getElementById('destPort');
        els.destPortId = document.getElementById('destPortId');
        els.destDropdown = document.getElementById('destDropdown');
        els.containerType = document.getElementById('containerType');
        els.containerQty = document.getElementById('containerQty');
        els.cargoWeight = document.getElementById('cargoWeight');
        els.commodityType = document.getElementById('commodityType');
        els.readyDate = document.getElementById('readyDate');
        els.btnSearch = document.getElementById('btnSearch');
        els.qtyMinus = document.getElementById('qtyMinus');
        els.qtyPlus = document.getElementById('qtyPlus');

        // Results
        els.resultsSection = document.getElementById('resultsSection');
        els.resultsLoading = document.getElementById('resultsLoading');
        els.resultsContent = document.getElementById('resultsContent');
        els.resultsGrid = document.getElementById('resultsGrid');
        els.resultsTitle = document.getElementById('resultsTitle');
        els.resultsSubtitle = document.getElementById('resultsSubtitle');
        els.noResults = document.getElementById('noResults');

        // Auth modal
        els.authModal = document.getElementById('authModal');
        els.modalClose = document.getElementById('modalClose');
        els.loginForm = document.getElementById('loginForm');
        els.signupForm = document.getElementById('signupForm');
        els.loginFormEl = document.getElementById('loginFormEl');
        els.signupFormEl = document.getElementById('signupFormEl');
        els.loginEmail = document.getElementById('loginEmail');
        els.loginPassword = document.getElementById('loginPassword');
        els.loginError = document.getElementById('loginError');
        els.signupEmail = document.getElementById('signupEmail');
        els.signupPassword = document.getElementById('signupPassword');
        els.signupPasswordConfirm = document.getElementById('signupPasswordConfirm');
        els.signupFirstName = document.getElementById('signupFirstName');
        els.signupLastName = document.getElementById('signupLastName');
        els.signupCompany = document.getElementById('signupCompany');
        els.signupBusinessReg = document.getElementById('signupBusinessReg');
        els.signupError = document.getElementById('signupError');
        els.switchToSignup = document.getElementById('switchToSignup');
        els.switchToLogin = document.getElementById('switchToLogin');
        els.switchToForgot = document.getElementById('switchToForgot');
        els.forgotToLogin = document.getElementById('forgotToLogin');
        els.btnLogin = document.getElementById('btnLogin');
        els.btnSignup = document.getElementById('btnSignup');

        // Forgot password
        els.forgotForm = document.getElementById('forgotForm');
        els.forgotFormEl = document.getElementById('forgotFormEl');
        els.forgotEmail = document.getElementById('forgotEmail');
        els.forgotError = document.getElementById('forgotError');
        els.forgotSuccess = document.getElementById('forgotSuccess');
        els.btnForgot = document.getElementById('btnForgot');

        // Reset password
        els.resetPasswordForm = document.getElementById('resetPasswordForm');
        els.resetPasswordFormEl = document.getElementById('resetPasswordFormEl');
        els.resetNewPassword = document.getElementById('resetNewPassword');
        els.resetConfirmPassword = document.getElementById('resetConfirmPassword');
        els.resetError = document.getElementById('resetError');
        els.btnResetPassword = document.getElementById('btnResetPassword');

        // Booking modal
        els.bookingModal = document.getElementById('bookingModal');
        els.bookingModalClose = document.getElementById('bookingModalClose');
        els.bookingFormEl = document.getElementById('bookingFormEl');
        els.bookingSummary = document.getElementById('bookingSummary');
        els.bookingName = document.getElementById('bookingName');
        els.bookingEmail = document.getElementById('bookingEmail');
        els.bookingPhone = document.getElementById('bookingPhone');
        els.bookingNotes = document.getElementById('bookingNotes');
        els.bookingError = document.getElementById('bookingError');
        els.bookingSuccess = document.getElementById('bookingSuccess');
        els.btnBookingSubmit = document.getElementById('btnBookingSubmit');
    }

    // ─── Initialize ───
    // Module-level flag: blocks ALL auth events until the user resets their password.
    let pendingRecovery = false;

    async function init() {
        console.log('[GL] init() started');
        initElements();

        // ── 1. Detect recovery flow BEFORE Supabase sees the URL ──
        // Supabase implicit-flow redirect:  …/rates/#access_token=…&type=recovery
        // Supabase PKCE redirect:           …/rates/?code=…
        const rawHash = window.location.hash || '';
        const rawSearch = window.location.search || '';
        if (rawHash.includes('type=recovery') || rawSearch.includes('type=recovery')) {
            pendingRecovery = true;
        }

        // ── 2. Show reset modal IMMEDIATELY (before Supabase processes anything) ──
        if (pendingRecovery) {
            showModalView('resetPassword');
            els.authModal.classList.add('active');
        }

        // ── 3. Create Supabase client ──
        console.log('[GL] window.supabase =', typeof window.supabase);
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storageKey: 'sb-rates-auth-token',
                    detectSessionInUrl: true
                }
            });
        } catch (e) {
            console.error('[GL] Supabase initialization failed:', e);
            return;
        }
        console.log('[GL] Supabase client created');

        // ── 4. Restore session BEFORE registering the auth listener ──
        // In Supabase JS v2, calling getSession() after onAuthStateChange can
        // hang forever due to an internal lock. Calling it first avoids this.
        // A timeout guard ensures we never block init() indefinitely.
        try {
            if (!pendingRecovery) {
                const sessionPromise = supabase.auth.getSession();
                const timeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('getSession timed out')), 5000)
                );
                const { data: { session } } = await Promise.race([sessionPromise, timeout]);
                console.log('[GL] getSession resolved, session:', !!session);
                if (session) {
                    await handleAuthChange(session);
                }
            }
        } catch (e) {
            console.error('[GL] Session restore failed (non-fatal):', e);
        }
        console.log('[GL] Session restore done');

        // ── 5. Auth state listener — registered AFTER getSession ──
        supabase.auth.onAuthStateChange(async (event, session) => {
            // During recovery, suppress ALL events that would show the user as logged in.
            // The only thing we allow is PASSWORD_RECOVERY (to redundantly ensure the modal is open).
            if (pendingRecovery) {
                if (event === 'PASSWORD_RECOVERY') {
                    showModalView('resetPassword');
                    els.authModal.classList.add('active');
                }
                // Block SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED, etc.
                return;
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                await handleAuthChange(session);
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                currentProfile = null;
                updateAuthUI();
            }
        });

        // Preload data — each loader has its own try/catch, but wrap the
        // Promise.all as defence-in-depth so bindEvents() always runs.
        try {
            await Promise.all([loadPorts(), loadContainerTypes(), loadPricingTiers(), loadCommodityTypes(), loadSettings()]);
        } catch (e) {
            console.error('[GL] Data preload failed (non-fatal):', e);
        }
        console.log('[GL] Data preload done, portsCache length:', portsCache.length);

        // Bind events — MUST run regardless of any earlier failures
        console.log('[GL] Calling bindEvents()');
        bindEvents();

        // Set min date for ready date
        const today = new Date().toISOString().split('T')[0];
        els.readyDate.setAttribute('min', today);
    }

    // ─── Load Container Types from DB ───
    async function loadContainerTypes() {
        try {
            const { data, error } = await supabase
                .from('container_types')
                .select('name, label, sort_order')
                .eq('active', true)
                .order('sort_order');

            if (error) throw error;

            const select = els.containerType;
            // Clear existing options except placeholder
            select.innerHTML = '<option value="">Select container type</option>';
            (data || []).forEach(ct => {
                CONTAINER_LABELS[ct.name] = ct.label;
                const opt = document.createElement('option');
                opt.value = ct.name;
                opt.textContent = ct.label;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load container types:', e);
            // Fallback: keep whatever is in the dropdown
        }
    }

    // ─── Load Pricing Tiers from DB ───
    async function loadPricingTiers() {
        try {
            const { data, error } = await supabase
                .from('pricing_tiers')
                .select('name, label, sort_order')
                .eq('active', true)
                .order('sort_order');

            if (error) throw error;

            TIER_LIST = (data || []).map(t => t.name);
            (data || []).forEach(t => { TIER_LABELS[t.name] = t.label; });
        } catch (e) {
            console.error('Failed to load pricing tiers:', e);
            TIER_LABELS = { 'public': 'Public', 'standard': 'Standard', 'tier_1': 'Tier 1' };
            TIER_LIST = ['public', 'standard', 'tier_1'];
        }
    }

    // ─── Load Commodity Types from DB ───
    async function loadCommodityTypes() {
        try {
            const { data, error } = await supabase
                .from('commodity_types')
                .select('name, label, sort_order')
                .eq('active', true)
                .order('sort_order');

            if (error) throw error;

            const select = els.commodityType;
            select.innerHTML = '<option value="">Select commodity type</option>';
            COMMODITY_LABELS = {};
            (data || []).forEach(ct => {
                COMMODITY_LABELS[ct.name] = ct.label;
                const opt = document.createElement('option');
                opt.value = ct.name;
                opt.textContent = ct.label;
                select.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load commodity types:', e);
        }
    }

    // ─── Load Platform Settings (D/O Fee etc.) ───
    async function loadSettings() {
        try {
            const { data, error } = await supabase
                .from('platform_settings')
                .select('key, value');
            if (error) throw error;
            (data || []).forEach(s => {
                if (s.key === 'bl_fee') BL_FEE = parseFloat(s.value) || 0;
                if (s.key === 'contact_email') CONTACT_EMAIL = s.value.trim() || CONTACT_EMAIL;
            });
        } catch (e) {
            console.error('Failed to load platform settings:', e);
        }
    }

    // ─── Auth ───
    async function handleAuthChange(session) {
        if (session?.user) {
            currentUser = session.user;
            // Fetch profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

            currentProfile = profile;
            updateAuthUI();
        }
    }

    function updateAuthUI() {
        if (currentUser && currentProfile) {
            els.authInfo.style.display = 'none';
            els.authActions.style.display = 'none';
            els.authUser.style.display = 'flex';
            els.userEmail.textContent = currentUser.email;
            els.userTier.textContent = TIER_LABELS[currentProfile.pricing_tier] || 'Public';
        } else {
            els.authInfo.style.display = 'flex';
            els.authActions.style.display = 'flex';
            els.authUser.style.display = 'none';
        }
    }

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email, password
        });
        if (error) throw error;
        return data;
    }

    function getRatesPageUrl() {
        return new URL('index.html', window.location.href).toString();
    }

    async function signup(email, password, metaData) {
        const options = {
            email,
            password,
            options: {
                emailRedirectTo: getRatesPageUrl()
            }
        };
        if (metaData && Object.keys(metaData).length > 0) {
            options.options.data = metaData;
        }
        const { data, error } = await supabase.auth.signUp(options);
        if (error) throw error;

        // Update profile with extra fields if provided
        if (data?.user?.id) {
            const profileUpdate = {};
            if (metaData.company) profileUpdate.company = metaData.company;
            if (metaData.first_name) profileUpdate.first_name = metaData.first_name;
            if (metaData.last_name) profileUpdate.last_name = metaData.last_name;
            if (Object.keys(profileUpdate).length > 0) {
                await supabase.from('profiles').update(profileUpdate).eq('id', data.user.id);
            }
        }
        return data;
    }

    async function logout() {
        await supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        updateAuthUI();
    }

    async function resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getRatesPageUrl()
        });
        if (error) throw error;
    }

    async function updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
    }

    // Helper to switch which form is shown inside the auth modal
    function showModalView(view) {
        els.loginForm.style.display = view === 'login' ? 'block' : 'none';
        els.signupForm.style.display = view === 'signup' ? 'block' : 'none';
        els.forgotForm.style.display = view === 'forgot' ? 'block' : 'none';
        els.resetPasswordForm.style.display = view === 'resetPassword' ? 'block' : 'none';
    }

    // ─── Ports ───
    async function loadPorts() {
        try {
            const { data, error } = await supabase
                .from('ports')
                .select('id, name, country, port_code')
                .order('name');

            if (error) throw error;
            portsCache = data || [];
            console.log('[GL] loadPorts: loaded', portsCache.length, 'ports');
        } catch (e) {
            console.error('[GL] Failed to load ports:', e);
            portsCache = [];
        }
    }

    function filterPorts(query) {
        if (!query || query.length < 1) return [];
        const lower = query.toLowerCase();
        return portsCache.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            p.country.toLowerCase().includes(lower) ||
            (p.port_code && p.port_code.toLowerCase().includes(lower))
        ).slice(0, 15);
    }

    function renderDropdown(dropdown, results, inputEl, hiddenEl) {
        dropdown.innerHTML = '';
        if (results.length === 0) {
            dropdown.classList.remove('active');
            return;
        }

        results.forEach((port, idx) => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.dataset.index = idx;
            item.innerHTML = `
                <div>
                    <div class="port-name">${port.name}</div>
                    <div class="port-country">${port.country}</div>
                </div>
                ${port.port_code ? `<span class="port-code">${port.port_code}</span>` : ''}
            `;
            item.addEventListener('click', () => {
                inputEl.value = `${port.name}, ${port.country}`;
                hiddenEl.value = port.id;
                dropdown.classList.remove('active');
                // Remove error state
                inputEl.closest('.form-group').classList.remove('error');
            });
            dropdown.appendChild(item);
        });

        // Prevent mousedown on dropdown items from blurring the input.
        // Without this, the browser fires mousedown → blur → click, and a
        // pending debounce timer can replace the dropdown content between
        // mousedown and click, orphaning the click target.
        dropdown.onmousedown = (e) => e.preventDefault();

        dropdown.classList.add('active');
    }

    // ─── Rate Search ───
    async function searchRates(originId, destId, containerType) {
        const userTier = currentProfile?.pricing_tier || 'public';
        // Build fallback chain: from current tier down to public
        const idx = TIER_LIST.indexOf(userTier);
        const tierChain = idx >= 0 ? TIER_LIST.slice(0, idx + 1).reverse() : ['public'];

        for (const tier of tierChain) {
            try {
                const { data, error } = await supabase.rpc('search_rates', {
                    p_origin_id: originId,
                    p_destination_id: destId,
                    p_container_type: containerType,
                    p_user_tier: tier
                });

                if (error) {
                    console.error('RPC error:', error);
                    // Fallback to direct query
                    return await searchRatesDirect(originId, destId, containerType, tierChain);
                }

                if (data && data.length > 0) {
                    return data;
                }
            } catch (e) {
                console.error('Search error for tier', tier, ':', e);
            }
        }

        return [];
    }

    // Fallback direct query in case the RPC doesn't exist yet
    async function searchRatesDirect(originId, destId, containerType, tierChain) {
        const today = new Date().toISOString().split('T')[0];

        for (const tier of tierChain) {
            try {
                const { data, error } = await supabase
                    .from('rates')
                    .select(`
                        id,
                        container_type,
                        pricing_tier,
                        rate_value,
                        transit_time,
                        valid_from,
                        valid_to,
                        origin:ports!rates_origin_id_fkey(name, country),
                        destination:ports!rates_destination_id_fkey(name, country)
                    `)
                    .eq('origin_id', originId)
                    .eq('destination_id', destId)
                    .eq('container_type', containerType)
                    .eq('pricing_tier', tier)
                    .eq('active', true)
                    .lte('valid_from', today)
                    .gte('valid_to', today)
                    .order('rate_value', { ascending: true })
                    .limit(10);

                if (error) {
                    console.error('Direct query error:', error);
                    continue;
                }

                if (data && data.length > 0) {
                    // Reshape to match RPC output
                    return data.map(r => ({
                        id: r.id,
                        origin_name: r.origin?.name,
                        origin_country: r.origin?.country,
                        destination_name: r.destination?.name,
                        destination_country: r.destination?.country,
                        container_type: r.container_type,
                        pricing_tier: r.pricing_tier,
                        rate_value: r.rate_value,
                        transit_time: r.transit_time,
                        valid_from: r.valid_from,
                        valid_to: r.valid_to
                    }));
                }
            } catch (e) {
                console.error('Direct query error for tier', tier, ':', e);
            }
        }

        return [];
    }

    // ─── Render Results ───
    function renderResults(rates, qty) {
        els.resultsGrid.innerHTML = '';

        rates.forEach(rate => {
            const freight = parseFloat(rate.rate_value) * qty;
            const grandTotal = (freight + BL_FEE).toFixed(2);
            const validFrom = new Date(rate.valid_from).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const validTo = new Date(rate.valid_to).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            const blLine = BL_FEE > 0
                ? `<div class="rate-detail" style="color:#6366f1;font-size:13px;">+ D/O Fee: <strong>$${BL_FEE.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>`
                : '';

            const card = document.createElement('div');
            card.className = 'rate-card';
            card.innerHTML = `
                <div class="rate-card-top">
                    <div class="route-info">
                        <div class="port-info">
                            <div class="port-label">Origin</div>
                            <div class="port-name">${rate.origin_name}</div>
                            <div class="port-country">${rate.origin_country}</div>
                        </div>
                        <div class="route-arrow">
                            <div class="arrow-line"></div>
                            ${rate.transit_time ? `<span class="transit-label">${rate.transit_time}</span>` : ''}
                        </div>
                        <div class="port-info">
                            <div class="port-label">Destination</div>
                            <div class="port-name">${rate.destination_name}</div>
                            <div class="port-country">${rate.destination_country}</div>
                        </div>
                    </div>
                    <div class="price-info">
                        <div class="price-label">Per Container</div>
                        <div class="price-value">$${parseFloat(rate.rate_value).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                        <div class="price-unit">USD</div>
                    </div>
                </div>
                <div class="rate-card-bottom">
                    <div class="rate-details">
                        <div class="rate-detail">
                            <strong>${CONTAINER_LABELS[rate.container_type] || rate.container_type}</strong>
                        </div>
                        <div class="rate-detail">
                            × <strong>${qty}</strong> container${qty > 1 ? 's' : ''}
                        </div>
                        ${blLine}
                        <div class="validity-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Valid ${validFrom} – ${validTo}
                        </div>
                    </div>
                    <div class="total-price">Total: $${parseFloat(grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span style="font-size:11px;opacity:0.65;font-weight:500;">incl. D/O</span></div>
                    <button class="btn-book" data-rate-id="${rate.id}" data-origin="${rate.origin_name}, ${rate.origin_country}" data-dest="${rate.destination_name}, ${rate.destination_country}" data-container="${CONTAINER_LABELS[rate.container_type]}" data-qty="${qty}" data-rate="${rate.rate_value}" data-freight="${freight.toFixed(2)}" data-bl="${BL_FEE.toFixed(2)}" data-total="${grandTotal}" data-commodity="${els.commodityType.value ? (COMMODITY_LABELS[els.commodityType.value] || els.commodityType.value) : ''}" data-readydate="${els.readyDate.value || ''}" data-validfrom="${validFrom}" data-validto="${validTo}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        Request Booking
                    </button>
                </div>
            `;
            els.resultsGrid.appendChild(card);
        });

        // Bind booking buttons
        document.querySelectorAll('.btn-book').forEach(btn => {
            btn.addEventListener('click', () => openBookingModal(btn.dataset));
        });
    }

    // ─── Booking Modal ───
    function openBookingModal(data) {
        const commodityLine = data.commodity ? `<div class="booking-detail"><span>Commodity:</span><strong>${data.commodity}</strong></div>` : '';
        const blLine = parseFloat(data.bl) > 0
            ? `<div class="booking-detail" style="color:#6366f1;"><span>D/O Fee:</span><strong>$${parseFloat(data.bl).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></div>`
            : '';
        const readyDateLine = data.readydate ? `<div class="booking-detail"><span>Cargo Ready Date:</span><strong>${data.readydate}</strong></div>` : '';
        els.bookingSummary.innerHTML = `
            <div class="booking-route">${data.origin} → ${data.dest}</div>
            <div class="booking-detail"><span>Container:</span><strong>${data.container}</strong></div>
            <div class="booking-detail"><span>Quantity:</span><strong>${data.qty}</strong></div>
            ${commodityLine}
            ${readyDateLine}
            <div class="booking-detail"><span>Rate / Container:</span><strong>$${parseFloat(data.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></div>
            <div class="booking-detail"><span>Freight Total:</span><strong>$${parseFloat(data.freight).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></div>
            ${blLine}
            <div class="booking-detail" style="border-top:1px solid #e2e8f0;margin-top:8px;padding-top:8px;font-size:15px;"><span><strong>Grand Total:</strong></span><strong style="color:#1e40af;">$${parseFloat(data.total).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></div>
        `;

        // Prefill email if logged in
        if (currentUser) {
            els.bookingEmail.value = currentUser.email;
        }

        els.bookingModal.classList.add('active');
        lastSearchParams = data;
    }

    async function handleBookingSubmit(e) {
        e.preventDefault();
        const name = els.bookingName.value.trim();
        const email = els.bookingEmail.value.trim();
        const phone = els.bookingPhone.value.trim();
        const notes = els.bookingNotes.value.trim();

        if (!name || !email) return;

        // Show loading state
        els.bookingError.textContent = '';
        els.bookingError.style.display = 'none';
        els.bookingSuccess.style.display = 'none';
        toggleBtnLoading(els.btnBookingSubmit, true);

        try {
            const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/send-booking-email`;

            const response = await fetch(edgeFunctionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    customerName: name,
                    customerEmail: email,
                    customerPhone: phone,
                    customerNotes: notes,
                    origin: lastSearchParams.origin,
                    destination: lastSearchParams.dest,
                    container: lastSearchParams.container,
                    quantity: lastSearchParams.qty,
                    commodity: lastSearchParams.commodity || '',
                    readyDate: lastSearchParams.readydate || '',
                    ratePerContainer: lastSearchParams.rate,
                    freightTotal: lastSearchParams.freight,
                    blFee: lastSearchParams.bl,
                    grandTotal: lastSearchParams.total,
                    validFrom: lastSearchParams.validfrom || '',
                    validTo: lastSearchParams.validto || ''
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to send booking request');
            }

            // Show success
            els.bookingSuccess.style.display = 'flex';
            els.bookingFormEl.reset();

            // Close modal after showing success briefly
            setTimeout(() => {
                els.bookingModal.classList.remove('active');
                els.bookingSuccess.style.display = 'none';
            }, 3000);
        } catch (err) {
            console.error('Booking submit error:', err);
            els.bookingError.textContent = err.message || 'Something went wrong. Please try again.';
            els.bookingError.style.display = 'block';
        }

        toggleBtnLoading(els.btnBookingSubmit, false);
    }

    // ─── Form Validation ───
    function validateForm() {
        let valid = true;

        // Origin
        const originGroup = document.getElementById('originGroup');
        if (!els.originPortId.value) {
            originGroup.classList.add('error');
            valid = false;
        } else {
            originGroup.classList.remove('error');
        }

        // Destination
        const destGroup = document.getElementById('destGroup');
        if (!els.destPortId.value) {
            destGroup.classList.add('error');
            valid = false;
        } else {
            destGroup.classList.remove('error');
        }

        // Container type
        const containerGroup = document.getElementById('containerGroup');
        if (!els.containerType.value) {
            containerGroup.classList.add('error');
            valid = false;
        } else {
            containerGroup.classList.remove('error');
        }

        // Qty
        const qty = parseInt(els.containerQty.value);
        if (!qty || qty < 1) {
            els.containerQty.value = 1;
        }

        return valid;
    }

    // ─── Event Binding ───
    function bindEvents() {
        // Port autocomplete
        els.originPort.addEventListener('input', () => {
            console.log('[GL] originPort input event, value:', els.originPort.value, 'portsCache:', portsCache.length);
            clearTimeout(originDebounce);
            els.originPortId.value = '';
            originDebounce = setTimeout(() => {
                const results = filterPorts(els.originPort.value);
                console.log('[GL] filterPorts returned', results.length, 'results');
                renderDropdown(els.originDropdown, results, els.originPort, els.originPortId);
            }, 150);
        });

        els.destPort.addEventListener('input', () => {
            clearTimeout(destDebounce);
            els.destPortId.value = '';
            destDebounce = setTimeout(() => {
                const results = filterPorts(els.destPort.value);
                renderDropdown(els.destDropdown, results, els.destPort, els.destPortId);
            }, 150);
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#originGroup')) {
                els.originDropdown.classList.remove('active');
            }
            if (!e.target.closest('#destGroup')) {
                els.destDropdown.classList.remove('active');
            }
        });

        // Focus shows dropdown if there's text; also close the opposite
        // dropdown and cancel its debounce to avoid stale re-renders.
        els.originPort.addEventListener('focus', () => {
            clearTimeout(destDebounce);
            els.destDropdown.classList.remove('active');
            if (els.originPort.value.length > 0) {
                const results = filterPorts(els.originPort.value);
                renderDropdown(els.originDropdown, results, els.originPort, els.originPortId);
            }
        });

        els.destPort.addEventListener('focus', () => {
            clearTimeout(originDebounce);
            els.originDropdown.classList.remove('active');
            if (els.destPort.value.length > 0) {
                const results = filterPorts(els.destPort.value);
                renderDropdown(els.destDropdown, results, els.destPort, els.destPortId);
            }
        });

        // Quantity buttons
        els.qtyMinus.addEventListener('click', () => {
            const v = parseInt(els.containerQty.value) || 1;
            if (v > 1) els.containerQty.value = v - 1;
        });

        els.qtyPlus.addEventListener('click', () => {
            const v = parseInt(els.containerQty.value) || 1;
            if (v < 999) els.containerQty.value = v + 1;
        });

        // Search form submit
        els.searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validateForm()) return;

            const originId = els.originPortId.value;
            const destId = els.destPortId.value;
            const containerType = els.containerType.value;
            const qty = parseInt(els.containerQty.value) || 1;

            // Show loading
            els.resultsSection.style.display = 'block';
            els.resultsLoading.style.display = 'block';
            els.resultsContent.style.display = 'none';
            els.noResults.style.display = 'none';

            // Scroll to results
            els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            els.btnSearch.classList.add('loading');
            els.btnSearch.innerHTML = '<span class="spinner-small"></span> Searching...';

            try {
                // Safety timeout: abort after 15 seconds to prevent infinite loading
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Search timed out')), 15000)
                );
                const rates = await Promise.race([
                    searchRates(originId, destId, containerType),
                    timeoutPromise
                ]);

                els.resultsLoading.style.display = 'none';

                if (rates && rates.length > 0) {
                    els.resultsTitle.textContent = `${rates[0].origin_name} → ${rates[0].destination_name}`;
                    els.resultsSubtitle.textContent = `${CONTAINER_LABELS[containerType]} · ${qty} container${qty > 1 ? 's' : ''}`;
                    renderResults(rates, qty);
                    els.resultsContent.style.display = 'block';
                } else {
                    els.noResults.style.display = 'block';
                }
            } catch (error) {
                console.error('Search failed:', error);
                els.resultsLoading.style.display = 'none';
                els.noResults.style.display = 'block';
            } finally {
                // Always reset button state
                els.btnSearch.classList.remove('loading');
                els.btnSearch.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    Search Rates
                `;
            }
        });

        // Auth modal
        els.btnShowLogin.addEventListener('click', () => {
            showModalView('login');
            els.loginError.textContent = '';
            els.authModal.classList.add('active');
        });

        els.btnShowSignup.addEventListener('click', () => {
            showModalView('signup');
            els.signupError.textContent = '';
            els.authModal.classList.add('active');
        });

        els.modalClose.addEventListener('click', () => {
            els.authModal.classList.remove('active');
        });

        els.switchToSignup.addEventListener('click', () => {
            showModalView('signup');
            els.signupError.textContent = '';
        });

        els.switchToLogin.addEventListener('click', () => {
            showModalView('login');
            els.loginError.textContent = '';
        });

        // Forgot password navigation
        els.switchToForgot.addEventListener('click', () => {
            showModalView('forgot');
            els.forgotError.textContent = '';
            els.forgotSuccess.style.display = 'none';
            els.btnForgot.style.display = '';
            els.forgotFormEl.reset();
        });

        els.forgotToLogin.addEventListener('click', () => {
            showModalView('login');
            els.loginError.textContent = '';
        });

        // Forgot password form submit
        els.forgotFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = els.forgotEmail.value.trim();

            if (!email) {
                els.forgotError.textContent = 'Please enter your email address.';
                return;
            }

            toggleBtnLoading(els.btnForgot, true);
            els.forgotError.textContent = '';
            els.forgotSuccess.style.display = 'none';

            try {
                await resetPassword(email);
                els.forgotSuccess.style.display = 'flex';
                els.btnForgot.style.display = 'none';
            } catch (err) {
                els.forgotError.textContent = err.message || 'Failed to send reset link. Please try again.';
            }

            toggleBtnLoading(els.btnForgot, false);
        });

        // Reset password form submit (after clicking emailed link)
        els.resetPasswordFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = els.resetNewPassword.value;
            const confirmPass = els.resetConfirmPassword.value;

            if (!newPass || !confirmPass) {
                els.resetError.textContent = 'Please fill in both fields.';
                return;
            }

            if (newPass.length < 6) {
                els.resetError.textContent = 'Password must be at least 6 characters.';
                return;
            }

            if (newPass !== confirmPass) {
                els.resetError.textContent = 'Passwords do not match.';
                return;
            }

            toggleBtnLoading(els.btnResetPassword, true);
            els.resetError.textContent = '';

            try {
                await updatePassword(newPass);
                // Recovery is complete — unlock auth events and load the session
                pendingRecovery = false;
                const { data: { session } } = await supabase.auth.getSession();
                if (session) await handleAuthChange(session);
                els.authModal.classList.remove('active');
                els.resetPasswordFormEl.reset();
                alert('Password updated successfully! You are now logged in.');
            } catch (err) {
                els.resetError.textContent = err.message || 'Failed to update password. Please try again.';
            }

            toggleBtnLoading(els.btnResetPassword, false);
        });

        // Login form
        els.loginFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = els.loginEmail.value.trim();
            const password = els.loginPassword.value;

            if (!email || !password) {
                els.loginError.textContent = 'Please fill in all fields.';
                return;
            }

            // Show loading
            toggleBtnLoading(els.btnLogin, true);

            try {
                await login(email, password);
                els.authModal.classList.remove('active');
                els.loginFormEl.reset();
                els.loginError.textContent = '';
            } catch (err) {
                els.loginError.textContent = err.message || 'Login failed. Please try again.';
            }

            toggleBtnLoading(els.btnLogin, false);
        });

        // Signup form
        els.signupFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = els.signupEmail.value.trim();
            const password = els.signupPassword.value;
            const confirm = els.signupPasswordConfirm.value;

            if (!email || !password || !confirm) {
                els.signupError.textContent = 'Please fill in all fields.';
                return;
            }

            if (password.length < 6) {
                els.signupError.textContent = 'Password must be at least 6 characters.';
                return;
            }

            if (password !== confirm) {
                els.signupError.textContent = 'Passwords do not match.';
                return;
            }

            toggleBtnLoading(els.btnSignup, true);

            try {
                const company = els.signupCompany ? els.signupCompany.value.trim() : '';
                const businessReg = els.signupBusinessReg ? els.signupBusinessReg.value.trim() : '';
                const firstName = els.signupFirstName ? els.signupFirstName.value.trim() : '';
                const lastName = els.signupLastName ? els.signupLastName.value.trim() : '';
                const metaData = {};
                if (company) metaData.company = company;
                if (businessReg) metaData.business_registration_number = businessReg;
                if (firstName) metaData.first_name = firstName;
                if (lastName) metaData.last_name = lastName;
                await signup(email, password, metaData);

                // Trigger new user notification email
                try {
                    await supabase.functions.invoke('send-new-user-email', {
                        body: {
                            email: email,
                            firstName: firstName,
                            lastName: lastName,
                            company: company,
                            businessRegistrationNumber: businessReg,
                            role: 'customer'
                        }
                    });
                } catch (emailErr) {
                    console.error('Failed to send new user notification email:', emailErr);
                }

                els.signupError.textContent = '';
                els.signupFormEl.reset();
                
                // Show success state on the button
                const btnText = els.btnSignup.querySelector('.btn-text');
                if (btnText) {
                    btnText.textContent = 'Account Created! Check email';
                    els.btnSignup.style.backgroundColor = '#10b981'; // Success green
                }

                // Wait 3 seconds so the user can see the success message before closing the modal
                setTimeout(() => {
                    els.authModal.classList.remove('active');
                    // Reset button back to normal state
                    if (btnText) {
                        btnText.textContent = 'Create Account';
                        els.btnSignup.style.backgroundColor = ''; 
                    }
                }, 3000);
            } catch (err) {
                els.signupError.textContent = err.message || 'Signup failed. Please try again.';
            }

            toggleBtnLoading(els.btnSignup, false);
        });

        // Logout
        els.btnLogout.addEventListener('click', async () => {
            await logout();
        });

        // Close modal on overlay click
        els.authModal.addEventListener('click', (e) => {
            if (e.target === els.authModal) {
                els.authModal.classList.remove('active');
            }
        });

        // Booking modal
        els.bookingModalClose.addEventListener('click', () => {
            els.bookingModal.classList.remove('active');
        });

        els.bookingModal.addEventListener('click', (e) => {
            if (e.target === els.bookingModal) {
                els.bookingModal.classList.remove('active');
            }
        });

        els.bookingFormEl.addEventListener('submit', handleBookingSubmit);

        // Close modals on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                els.authModal.classList.remove('active');
                els.bookingModal.classList.remove('active');
            }
        });
    }

    // ─── Helpers ───
    function toggleBtnLoading(btn, loading) {
        const textSpan = btn.querySelector('.btn-text');
        const loadingSpan = btn.querySelector('.btn-loading');
        if (textSpan && loadingSpan) {
            textSpan.style.display = loading ? 'none' : 'inline';
            loadingSpan.style.display = loading ? 'inline-flex' : 'none';
        }
        btn.disabled = loading;
    }

    // ─── Start ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
