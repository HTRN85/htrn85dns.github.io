/**
 * HTRN85 DNS Security - Checkout Page JavaScript
 * SECURE IMPLEMENTATION - v2.0
 * 
 * Security Features:
 * - No sensitive credentials in frontend code
 * - Input sanitization & validation
 * - XSS prevention
 * - CSRF protection ready
 * - Secure error handling
 */

'use strict';

// ============================================================================
// CONFIGURATION (PUBLIC KEYS ONLY - NO SECRETS!)
// ============================================================================

const CONFIG = Object.freeze({
    // Square PUBLIC Application ID only (safe for frontend)
    // TODO: Replace with your PRODUCTION Square Application ID from https://developer.squareup.com/apps
    SQUARE_APPLICATION_ID: 'YOUR_PRODUCTION_SQUARE_APP_ID',
    // TODO: Replace with your PRODUCTION Square Location ID
    SQUARE_LOCATION_ID: 'YOUR_PRODUCTION_SQUARE_LOCATION_ID',

    // Backend API endpoint (all sensitive operations happen here)
    API_BASE_URL: '/api',

    // Validation limits
    MAX_CLIENTS: 2000,
    MIN_CLIENTS: 1,
    MAX_COMPANY_NAME_LENGTH: 200,
    MAX_NAME_LENGTH: 100,
    MAX_EMAIL_LENGTH: 254,
    MAX_PHONE_LENGTH: 20,

    // Timeouts
    PAYMENT_TIMEOUT_MS: 30000,
    SQUARE_INIT_RETRY_MS: 1000,
    SQUARE_INIT_MAX_RETRIES: 10
});

// Pricing tiers (validated server-side - this is for UI only)
const PRICING_TIERS = Object.freeze([
    { name: 'Starter', min: 0, max: 99, price: 200 },
    { name: 'Growth', min: 100, max: 199, price: 375 },
    { name: 'Business', min: 200, max: 299, price: 750 },
    { name: 'Professional', min: 300, max: 499, price: 1125 },
    { name: 'Enterprise', min: 500, max: 999, price: 2500 },
    { name: 'Enterprise Plus', min: 1000, max: 2000, price: 4000 }
]);

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const CheckoutState = {
    payments: null,
    card: null,
    selectedPlan: null,
    customerInfo: null,
    isProcessing: false,
    squareInitRetries: 0
};

// ============================================================================
// SECURITY UTILITIES
// ============================================================================

const SecurityUtils = {
    /**
     * Sanitize string to prevent XSS
     */
    sanitizeHTML(str) {
        if (typeof str !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Sanitize string for display (removes HTML tags)
     */
    sanitizeInput(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '') // Remove javascript protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
    },

    /**
     * Validate email format
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        if (email.length > CONFIG.MAX_EMAIL_LENGTH) return false;
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email);
    },

    /**
     * Validate phone format (optional field)
     */
    isValidPhone(phone) {
        if (!phone) return true; // Optional
        if (typeof phone !== 'string') return false;
        if (phone.length > CONFIG.MAX_PHONE_LENGTH) return false;
        return /^[\d\s\-\(\)\+\.]*$/.test(phone);
    },

    /**
     * Validate number within range
     */
    isValidNumber(value, min, max) {
        const num = parseInt(value, 10);
        return !isNaN(num) && num >= min && num <= max;
    },

    /**
     * Generate CSRF token (should match backend)
     */
    getCSRFToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content || '';
    }
};

// ============================================================================
// API CLIENT (SECURE COMMUNICATION)
// ============================================================================

const ApiClient = {
    /**
     * Make secure API request
     */
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': SecurityUtils.getCSRFToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.PAYMENT_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                ...defaultOptions,
                ...options,
                headers: { ...defaultOptions.headers, ...options.headers },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new ApiError(errorData.error || 'Request failed', response.status);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new ApiError('Request timed out. Please try again.', 408);
            }
            throw error;
        }
    },

    /**
     * Process payment via backend
     * Maps to: POST api/purchase/complete
     */
    async processPayment(paymentToken, customerInfo, plan) {
        return this.request('/purchase/complete', {
            method: 'POST',
            body: JSON.stringify({
                email:       customerInfo.email,
                companyName: customerInfo.companyName,
                contactName: `${customerInfo.firstName} ${customerInfo.lastName}`.trim(),
                planType:    plan.name,
                paymentId:   paymentToken
            })
        });
    }
};

/**
 * Custom API Error
 */
class ApiError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
    }
}

// ============================================================================
// UI UTILITIES
// ============================================================================

const UIUtils = {
    /**
     * Show alert message (XSS-safe)
     */
    showAlert(message, type = 'info') {
        const container = document.getElementById('payment-status-container');
        if (!container) {
            console.warn('Alert container not found');
            return;
        }

        const iconMap = {
            danger: 'exclamation-circle',
            success: 'check-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        // Create elements safely (no innerHTML with user data)
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-custom alert-dismissible fade show mt-3`;
        alertDiv.setAttribute('role', 'alert');

        const icon = document.createElement('i');
        icon.className = `fas fa-${iconMap[type] || 'info-circle'} me-2`;
        alertDiv.appendChild(icon);

        const text = document.createTextNode(message);
        alertDiv.appendChild(text);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'alert');
        alertDiv.appendChild(closeBtn);

        container.innerHTML = '';
        container.appendChild(alertDiv);
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    /**
     * Show loading overlay
     */
    showLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('active');
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('active');
    },

    /**
     * Format currency safely
     */
    formatCurrency(amount) {
        const num = parseFloat(amount);
        if (isNaN(num)) return '$0';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    },

    /**
     * Set text content safely
     */
    setTextContent(elementId, text) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = String(text);
    }
};

// ============================================================================
// CHECKOUT LOGIC
// ============================================================================

const Checkout = {
    /**
     * Initialize checkout page
     */
    init() {
        this.loadSelectedPlan();
        this.initializeForms();
    },

    /**
     * Load selected plan from session storage
     */
    loadSelectedPlan() {
        try {
            const saved = sessionStorage.getItem('selectedPlan');
            if (saved) {
                const plan = JSON.parse(saved);
                // Validate plan data
                if (this.isValidPlan(plan)) {
                    CheckoutState.selectedPlan = plan;
                    this.updateOrderSummary(plan);
                } else {
                    this.showPlanSelector();
                }
            } else {
                this.showPlanSelector();
            }
        } catch (e) {
            console.error('Error loading plan:', e);
            this.showPlanSelector();
        }
    },

    /**
     * Validate plan object
     */
    isValidPlan(plan) {
        return plan &&
            typeof plan.name === 'string' &&
            typeof plan.price === 'number' &&
            typeof plan.maxClients === 'number' &&
            plan.price > 0 &&
            plan.maxClients > 0;
    },

    /**
     * Show plan selector if no plan selected
     */
    showPlanSelector() {
        const summary = document.querySelector('.order-summary');
        if (!summary) return;

        summary.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'text-center p-4';

        const text = document.createElement('p');
        text.className = 'text-muted mb-3';
        text.textContent = 'No plan selected';

        const link = document.createElement('a');
        link.href = 'pricing.html';
        link.className = 'btn btn-primary';
        link.innerHTML = '<i class="fas fa-arrow-left"></i> Choose a Plan';

        container.appendChild(text);
        container.appendChild(link);
        summary.appendChild(container);
    },

    /**
     * Update order summary (XSS-safe)
     */
    updateOrderSummary(plan) {
        UIUtils.setTextContent('summaryPlanName', plan.name + ' Plan');
        UIUtils.setTextContent('summaryPlanClients', `Up to ${plan.maxClients} clients`);
        UIUtils.setTextContent('summaryPrice', UIUtils.formatCurrency(plan.price));
        UIUtils.setTextContent('summaryTotal', UIUtils.formatCurrency(plan.price));
        UIUtils.setTextContent('finalPrice', plan.price.toLocaleString());
    },

    /**
     * Initialize form handlers
     */
    initializeForms() {
        const companyForm = document.getElementById('companyInfoForm');
        if (companyForm) {
            companyForm.addEventListener('submit', (e) => this.handleCompanyInfoSubmit(e));
        }

        const numClientsInput = document.getElementById('numClients');
        if (numClientsInput && CheckoutState.selectedPlan) {
            numClientsInput.value = Math.floor((CheckoutState.selectedPlan.maxClients + 1) / 2);
            numClientsInput.addEventListener('input', (e) => this.handleClientCountChange(e));
        }

        const termsCheckbox = document.getElementById('termsAgree');
        if (termsCheckbox) {
            termsCheckbox.addEventListener('change', (e) => {
                const payButton = document.getElementById('card-button');
                if (payButton) payButton.disabled = !e.target.checked;
            });
        }
    },

    /**
     * Handle client count change
     */
    handleClientCountChange(e) {
        const numClients = parseInt(e.target.value, 10);

        if (!SecurityUtils.isValidNumber(numClients, CONFIG.MIN_CLIENTS, CONFIG.MAX_CLIENTS)) {
            return;
        }

        const tier = PRICING_TIERS.find(t => numClients >= t.min && numClients <= t.max);
        if (tier) {
            CheckoutState.selectedPlan = {
                name: tier.name,
                price: tier.price,
                maxClients: tier.max
            };
            this.updateOrderSummary(CheckoutState.selectedPlan);
        }
    },

    /**
     * Handle company info form submission
     */
    async handleCompanyInfoSubmit(e) {
        e.preventDefault();

        const form = e.target;
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        // Get and sanitize form values
        const companyName = SecurityUtils.sanitizeInput(document.getElementById('companyName')?.value || '');
        const firstName = SecurityUtils.sanitizeInput(document.getElementById('firstName')?.value || '');
        const lastName = SecurityUtils.sanitizeInput(document.getElementById('lastName')?.value || '');
        const email = SecurityUtils.sanitizeInput(document.getElementById('email')?.value || '');
        const phone = SecurityUtils.sanitizeInput(document.getElementById('phone')?.value || '');
        const numClients = parseInt(document.getElementById('numClients')?.value, 10);

        // Validate all inputs
        const errors = [];

        if (!companyName || companyName.length > CONFIG.MAX_COMPANY_NAME_LENGTH) {
            errors.push('Company name is required (max 200 characters)');
        }
        if (!firstName || firstName.length > CONFIG.MAX_NAME_LENGTH) {
            errors.push('First name is required (max 100 characters)');
        }
        if (!lastName || lastName.length > CONFIG.MAX_NAME_LENGTH) {
            errors.push('Last name is required (max 100 characters)');
        }
        if (!SecurityUtils.isValidEmail(email)) {
            errors.push('Please enter a valid email address');
        }
        if (!SecurityUtils.isValidPhone(phone)) {
            errors.push('Please enter a valid phone number');
        }
        if (!SecurityUtils.isValidNumber(numClients, CONFIG.MIN_CLIENTS, CONFIG.MAX_CLIENTS)) {
            errors.push(`Number of clients must be between ${CONFIG.MIN_CLIENTS} and ${CONFIG.MAX_CLIENTS}`);
        }

        if (errors.length > 0) {
            UIUtils.showAlert(errors.join('. '), 'danger');
            return;
        }

        // Find matching tier
        const tier = PRICING_TIERS.find(t => numClients >= t.min && numClients <= t.max);
        if (!tier) {
            UIUtils.showAlert('Invalid number of clients', 'danger');
            return;
        }

        // Store validated customer info
        CheckoutState.customerInfo = {
            companyName,
            firstName,
            lastName,
            email,
            phone,
            numClients
        };

        CheckoutState.selectedPlan = {
            name: tier.name,
            price: tier.price,
            maxClients: tier.max,
            actualClients: numClients
        };

        await this.showPaymentSection();
    },

    /**
     * Show payment section
     */
    async showPaymentSection() {
        document.getElementById('companyInfoCard').style.display = 'none';
        document.getElementById('paymentCard').style.display = 'block';

        const steps = document.querySelectorAll('.step');
        if (steps[0]) {
            steps[0].classList.add('complete');
            steps[0].classList.remove('active');
        }
        document.getElementById('stepPayment')?.classList.add('active');

        document.getElementById('paymentCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        await Payment.initializeSquare();
    },

    /**
     * Go back to company info
     */
    goBackToInfo() {
        document.getElementById('paymentCard').style.display = 'none';
        document.getElementById('companyInfoCard').style.display = 'block';

        const steps = document.querySelectorAll('.step');
        if (steps[0]) {
            steps[0].classList.remove('complete');
            steps[0].classList.add('active');
        }
        document.getElementById('stepPayment')?.classList.remove('active');

        document.getElementById('companyInfoCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

const Payment = {
    /**
     * Initialize Square Payment Form
     */
    async initializeSquare() {
        try {
            if (!window.Square) {
                if (CheckoutState.squareInitRetries < CONFIG.SQUARE_INIT_MAX_RETRIES) {
                    CheckoutState.squareInitRetries++;
                    UIUtils.showAlert('Payment system is loading. Please wait...', 'info');
                    setTimeout(() => this.initializeSquare(), CONFIG.SQUARE_INIT_RETRY_MS);
                } else {
                    UIUtils.showAlert('Payment system unavailable. Please refresh and try again.', 'danger');
                }
                return;
            }

            CheckoutState.payments = window.Square.payments(
                CONFIG.SQUARE_APPLICATION_ID, 
                CONFIG.SQUARE_LOCATION_ID
            );

            CheckoutState.card = await CheckoutState.payments.card();
            await CheckoutState.card.attach('#card-container');

            const payButton = document.getElementById('card-button');
            if (payButton) {
                payButton.addEventListener('click', (e) => this.handlePaymentSubmit(e));
            }
        } catch (error) {
            console.error('Square initialization failed:', error);
            this.showDemoMode();
        }
    },

    /**
     * Show demo mode (for testing without Square credentials)
     */
    showDemoMode() {
        const container = document.getElementById('card-container');
        if (!container) return;

        container.innerHTML = '';

        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-info';
        alertDiv.innerHTML = `
            <h6 class="fw-bold mb-2"><i class="fas fa-info-circle"></i> Demo Mode</h6>
            <p class="mb-2">Square payment integration will be activated with your API credentials.</p>
            <p class="small mb-0">For now, clicking "Complete Purchase" will simulate a successful payment.</p>
        `;

        const demoInfo = document.createElement('div');
        demoInfo.className = 'p-3 border rounded bg-light mt-2';
        demoInfo.innerHTML = `
            <p class="small text-muted mb-1"><i class="fas fa-credit-card"></i> Test Card: 4111 1111 1111 1111</p>
            <p class="small text-muted mb-1"><i class="fas fa-calendar"></i> Expiry: 12/25</p>
            <p class="small text-muted mb-0"><i class="fas fa-lock"></i> CVV: 123</p>
        `;

        container.appendChild(alertDiv);
        container.appendChild(demoInfo);

        const payButton = document.getElementById('card-button');
        if (payButton) {
            payButton.disabled = false;
            payButton.addEventListener('click', (e) => this.handleDemoPayment(e));
        }
    },

    /**
     * Handle payment submission
     */
    async handlePaymentSubmit(e) {
        e.preventDefault();

        if (CheckoutState.isProcessing) return;

        const termsCheckbox = document.getElementById('termsAgree');
        if (!termsCheckbox?.checked) {
            UIUtils.showAlert('Please agree to the Terms of Service and Privacy Policy', 'danger');
            return;
        }

        CheckoutState.isProcessing = true;
        UIUtils.showLoading();

        try {
            const result = await CheckoutState.card.tokenize();

            if (result.status === 'OK') {
                await this.processPayment(result.token);
            } else {
                let errorMessage = 'Card validation failed.';
                if (result.errors && result.errors.length > 0) {
                    errorMessage = result.errors.map(e => e.message).join('. ');
                }
                UIUtils.showAlert(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Payment error:', error);
            UIUtils.showAlert('Payment failed. Please try again.', 'danger');
        } finally {
            CheckoutState.isProcessing = false;
            UIUtils.hideLoading();
        }
    },

    /**
     * Handle demo payment
     */
    async handleDemoPayment(e) {
        e.preventDefault();

        if (CheckoutState.isProcessing) return;

        const termsCheckbox = document.getElementById('termsAgree');
        if (!termsCheckbox?.checked) {
            UIUtils.showAlert('Please agree to the Terms of Service and Privacy Policy', 'danger');
            return;
        }

        CheckoutState.isProcessing = true;
        UIUtils.showLoading();

        try {
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Use demo token - backend should handle this specially
            const demoToken = 'demo_' + crypto.randomUUID();
            await this.processPayment(demoToken);
        } catch (error) {
            console.error('Demo payment error:', error);
            UIUtils.showAlert('Payment simulation failed.', 'danger');
        } finally {
            CheckoutState.isProcessing = false;
            UIUtils.hideLoading();
        }
    },

    /**
     * Process payment with backend API
     * NOTE: Activation code MUST be generated server-side for security
     */
    async processPayment(paymentToken) {
        try {
            // Send to backend API - all sensitive operations happen server-side
            const response = await ApiClient.processPayment(
                paymentToken,
                CheckoutState.customerInfo,
                CheckoutState.selectedPlan
            );

            if (response.success) {
                // Store ONLY non-sensitive data for display on success page
                sessionStorage.setItem('purchaseResult', JSON.stringify({
                    activationCode: response.activationKey,      // backend: activationKey
                    planName:       response.planType            // backend: planType
                                    || CheckoutState.selectedPlan?.name,
                    maxClients:     response.maxComputers        // backend: maxComputers
                                    || CheckoutState.selectedPlan?.maxClients,
                    expiryDate:     response.expiryDate,
                    message:        response.message
                }));

                // Clear sensitive data
                CheckoutState.customerInfo = null;
                CheckoutState.selectedPlan = null;
                sessionStorage.removeItem('selectedPlan');

                // Redirect to success page
                window.location.href = 'success.html';
            } else {
                UIUtils.showAlert(response.error || 'Payment failed. Please try again.', 'danger');
            }
        } catch (error) {
            if (error instanceof ApiError) {
                UIUtils.showAlert(error.message, 'danger');
            } else {
                UIUtils.showAlert('Payment processing failed. Please try again or contact support.', 'danger');
            }
        }
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Checkout.init();
});

// Expose necessary functions to global scope for HTML onclick handlers
window.goBackToInfo = () => Checkout.goBackToInfo();

// ============================================================================
// ABANDONED CHECKOUT TRACKER
// Fires when a user leaves before clicking "Continue to Payment"
// Sends a notification email to htrn85@gmail.com via EmailJS
// ============================================================================

const AbandonedCheckoutTracker = {

    // -----------------------------------------------------------------------
    // EmailJS Configuration
    // Sign up free at https://www.emailjs.com then fill in these three values:
    // -----------------------------------------------------------------------
    EMAILJS_PUBLIC_KEY:  'TYeIprY1f6Oy_UGZa',   // Account > API Keys
    EMAILJS_SERVICE_ID:  'service_tjmly19',   // Email Services tab
    EMAILJS_TEMPLATE_ID: 'template_4h4cl9a',  // Email Templates tab
    // -----------------------------------------------------------------------

    OWNER_EMAIL: 'htrn85@gmail.com',
    hasAdvancedToPayment: false,
    hasSentAlert: false,

    /**
     * Start tracking — call this once after DOM ready
     */
    init() {
        // Mark when user successfully moves past Step 1
        const companyForm = document.getElementById('companyInfoForm');
        if (companyForm) {
            companyForm.addEventListener('submit', () => {
                this.hasAdvancedToPayment = true;
            });
        }

        // Capture when user switches tabs or minimises window
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.captureAndNotify();
            }
        });

        // Capture when user navigates away / closes tab
        window.addEventListener('beforeunload', () => {
            this.captureAndNotify();
        });

        // Also capture after 30 s of inactivity on the page
        let inactivityTimer;
        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => this.captureAndNotify(), 30000);
        };
        ['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
            document.addEventListener(ev, resetTimer, { passive: true })
        );
        resetTimer();
    },

    /**
     * Read every input on the page
     */
    captureFormData() {
        const get = id => {
            const el = document.getElementById(id);
            return el ? (el.value || '').trim() : '';
        };

        return {
            companyName : get('companyName'),
            firstName   : get('firstName'),
            lastName    : get('lastName'),
            email       : get('email'),
            phone       : get('phone'),
            numClients  : get('numClients'),
        };
    },

    /**
     * Snapshot the current order summary from the DOM
     */
    captureOrderSummary() {
        const get = id => {
            const el = document.getElementById(id);
            return el ? el.textContent.trim() : '—';
        };

        // Also pull from CheckoutState if available
        const plan = (typeof CheckoutState !== 'undefined' && CheckoutState.selectedPlan)
            ? CheckoutState.selectedPlan
            : null;

        return {
            planName   : plan ? plan.name   : get('summaryPlanName'),
            planPrice  : plan ? `$${plan.price}` : get('summaryPrice'),
            maxClients : plan ? plan.maxClients : get('summaryPlanClients'),
            total      : plan ? `$${plan.price}` : get('summaryTotal'),
        };
    },

    /**
     * Send the abandonment email — only fires once per page load
     */
    captureAndNotify() {
        // Don't fire if user completed Step 1 or we've already sent
        if (this.hasAdvancedToPayment || this.hasSentAlert) return;

        const data  = this.captureFormData();
        const order = this.captureOrderSummary();

        // Only notify if the visitor typed at least their email
        if (!data.email) return;

        this.hasSentAlert = true; // Prevent duplicate sends

        const timestamp = new Date().toLocaleString('en-US', {
            timeZone: 'America/New_York',
            dateStyle: 'full',
            timeStyle: 'short'
        });

        const templateParams = {
            to_email     : this.OWNER_EMAIL,
            subject      : `⚠️ Abandoned Checkout — ${data.email}`,
            timestamp    : timestamp,
            page_url     : window.location.href,

            // Customer info
            company_name : data.companyName || '(not entered)',
            first_name   : data.firstName   || '(not entered)',
            last_name    : data.lastName    || '(not entered)',
            customer_email: data.email,
            phone        : data.phone       || '(not entered)',
            num_clients  : data.numClients  || '(not entered)',

            // Order info
            plan_name    : order.planName   || '(unknown)',
            plan_price   : order.planPrice  || '(unknown)',
            max_clients  : order.maxClients || '(unknown)',
            total_due    : order.total      || '(unknown)',

            // Full snapshot used for the "screenshot" section of the email
            snapshot_html: this._buildSnapshotHTML(data, order, timestamp),
        };

        if (typeof emailjs === 'undefined') {
            console.warn('[AbandonedCheckout] EmailJS not loaded — cannot send alert.');
            return;
        }

        emailjs.init(this.EMAILJS_PUBLIC_KEY);

        emailjs.send(this.EMAILJS_SERVICE_ID, this.EMAILJS_TEMPLATE_ID, templateParams)
            .then(() => console.log('[AbandonedCheckout] Alert sent for', data.email))
            .catch(err => console.error('[AbandonedCheckout] Send failed', err));
    },

    /**
     * Build a formatted HTML "screenshot" of the checkout form
     */
    _buildSnapshotHTML(data, order, timestamp) {
        return `
<div style="font-family:Arial,sans-serif;max-width:600px;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
  <div style="background:#1a1a2e;color:white;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;">
    <strong>🛡️ HTRN85 DNS — Checkout Page</strong>
    <small style="opacity:0.7;">${timestamp}</small>
  </div>

  <div style="padding:24px;background:#f8f9fa;">
    <h3 style="margin:0 0 16px;color:#333;">📋 Company Information (Step 1)</h3>
    <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;">
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;width:40%;">Company Name</td>
        <td style="padding:10px 16px;font-weight:600;">${data.companyName || '<em style="color:#aaa">not entered</em>'}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">First Name</td>
        <td style="padding:10px 16px;font-weight:600;">${data.firstName || '<em style="color:#aaa">not entered</em>'}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">Last Name</td>
        <td style="padding:10px 16px;font-weight:600;">${data.lastName || '<em style="color:#aaa">not entered</em>'}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">Email Address</td>
        <td style="padding:10px 16px;font-weight:600;color:#0d6efd;">${data.email}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">Phone</td>
        <td style="padding:10px 16px;font-weight:600;">${data.phone || '<em style="color:#aaa">not entered</em>'}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;color:#666;">Roaming Clients</td>
        <td style="padding:10px 16px;font-weight:600;">${data.numClients || '<em style="color:#aaa">not entered</em>'}</td>
      </tr>
    </table>

    <h3 style="margin:24px 0 16px;color:#333;">🛒 Order Summary</h3>
    <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;">
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">Plan</td>
        <td style="padding:10px 16px;font-weight:600;">${order.planName}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 16px;color:#666;">Max Clients</td>
        <td style="padding:10px 16px;font-weight:600;">${order.maxClients}</td>
      </tr>
      <tr style="background:#fff8e1;">
        <td style="padding:10px 16px;color:#666;font-weight:700;">Total Due</td>
        <td style="padding:10px 16px;font-weight:700;font-size:1.2em;color:#e65100;">${order.total}</td>
      </tr>
    </table>

    <div style="margin-top:20px;padding:16px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px;">
      <strong>⚠️ This customer left before completing payment.</strong><br>
      <small>Page: <a href="${window.location.href}">${window.location.href}</a></small>
    </div>
  </div>
</div>`;
    }
};

// Start tracking immediately
document.addEventListener('DOMContentLoaded', () => {
    AbandonedCheckoutTracker.init();
});

