/**
 * HTRN85 DNS Security - Landing Page JavaScript
 * SECURE IMPLEMENTATION - v2.0
 * 
 * Security Features:
 * - XSS prevention via DOM manipulation
 * - Input validation
 * - Safe animations and interactions
 * - No sensitive data exposure
 */

'use strict';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = Object.freeze({
    MIN_CLIENTS: 1,
    MAX_CLIENTS: 2000,
    COUNTER_DURATION: 2000,
    REVEAL_THRESHOLD: 150
});

// Pricing tiers (immutable, for display only - validated server-side)
const PRICING_TIERS = Object.freeze([
    { name: 'Starter', min: 0, max: 99, price: 200 },
    { name: 'Growth', min: 100, max: 199, price: 375 },
    { name: 'Business', min: 200, max: 299, price: 750 },
    { name: 'Professional', min: 300, max: 499, price: 1125 },
    { name: 'Enterprise', min: 500, max: 999, price: 2500 },
    { name: 'Enterprise Plus', min: 1000, max: 2000, price: 4000 }
]);

// ============================================================================
// SECURITY UTILITIES
// ============================================================================

const SecurityUtils = {
    /**
     * Sanitize string for safe display
     */
    sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[<>]/g, '').trim();
    },

    /**
     * Safely parse integer
     */
    safeParseInt(value, defaultValue = 0) {
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    },

    /**
     * Validate number within range
     */
    isValidNumber(value, min, max) {
        const num = parseFloat(value);
        return !isNaN(num) && isFinite(num) && num >= min && num <= max;
    },

    /**
     * Validate email format
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(email);
    }
};

// ============================================================================
// UI UTILITIES
// ============================================================================

const UIUtils = {
    /**
     * Format currency safely
     */
    formatCurrency(amount) {
        const num = parseFloat(amount);
        if (isNaN(num) || num < 0) return '$0';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    },

    /**
     * Show loading overlay
     */
    showLoading() {
        let overlay = document.querySelector('.spinner-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'spinner-overlay';

            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            overlay.appendChild(spinner);

            document.body.appendChild(overlay);
        }
        overlay.classList.add('active');
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.querySelector('.spinner-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    },

    /**
     * Show success message (XSS-safe)
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    },

    /**
     * Show error message (XSS-safe)
     */
    showError(message) {
        this.showNotification('Error: ' + message, 'error');
    },

    /**
     * Show notification (XSS-safe)
     */
    showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification-toast').forEach(n => n.remove());

        const toast = document.createElement('div');
        toast.className = `notification-toast notification-${type}`;
        toast.textContent = SecurityUtils.sanitize(message);

        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            background: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: '10000',
            animation: 'fadeIn 0.3s ease'
        });

        document.body.appendChild(toast);

        // DISABLED: setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            // DISABLED: setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};

// ============================================================================
// PRICING & CHECKOUT FUNCTIONS
// ============================================================================

/**
 * Handle plan selection from pricing cards
 */
function selectPlan(planName, price, maxClients) {
    console.log('Plan selected:', planName, price, maxClients);

    // Store selected plan in sessionStorage
    try {
        sessionStorage.setItem('selectedPlan', JSON.stringify({
            planName: planName,
            price: price,
            maxClients: maxClients
        }));
    } catch (e) {
        console.error('SessionStorage error:', e);
    }

    // Redirect to checkout page
    window.location.href = 'checkout.html';
}

/**
 * Handle contact sales button
 */
function contactSales() {
    // Show contact modal or redirect to contact page
    UIUtils.showNotification('Redirecting to contact sales...', 'info');

    // For now, just show an alert
    setTimeout(() => {
        alert('For enterprise sales, please email: sales@htrn85dns.com\n\nOr call: 1-800-HTRN-DNS');
    }, 500);
}

// ============================================================================
// LANDING PAGE LOGIC
// ============================================================================

const LandingPage = {
    countersAnimated: false,

    /**
     * Initialize landing page
     */
    init() {
        this.initSmoothScroll();
        this.initScrollReveal();
        this.initStatsObserver();
        this.initNavbarScroll();
    },

    /**
     * Initialize smooth scrolling for anchor links
     */
    initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = anchor.getAttribute('href');
                if (!targetId || targetId === '#') return;

                const target = document.querySelector(targetId);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    },

    /**
     * Initialize scroll reveal animations
     */
    initScrollReveal() {
        // Add scroll-reveal class to elements
        document.querySelectorAll('.feature-card, .step-card, .pricing-card').forEach(card => {
            card.classList.add('scroll-reveal');
        });

        // Initial check
        this.revealOnScroll();

        // Listen for scroll
        window.addEventListener('scroll', () => this.revealOnScroll(), { passive: true });
    },

    /**
     * Reveal elements on scroll
     */
    revealOnScroll() {
        const reveals = document.querySelectorAll('.scroll-reveal');
        const windowHeight = window.innerHeight;

        reveals.forEach(element => {
            const elementTop = element.getBoundingClientRect().top;
            if (elementTop < windowHeight - CONFIG.REVEAL_THRESHOLD) {
                element.classList.add('active');
            }
        });
    },

    /**
     * Initialize stats section observer
     */
    initStatsObserver() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -100px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.target.classList.contains('stats-section')) {
                    if (!this.countersAnimated) {
                        this.animateCounters();
                        this.countersAnimated = true;
                    }
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        const statsSection = document.querySelector('.stats-section');
        if (statsSection) {
            observer.observe(statsSection);
        }
    },

    /**
     * Animate counter numbers
     */
    animateCounters() {
        const counters = document.querySelectorAll('.counter');

        counters.forEach(counter => {
            const targetAttr = counter.getAttribute('data-target');
            const target = parseFloat(targetAttr);

            if (isNaN(target) || target < 0) return;

            const duration = CONFIG.COUNTER_DURATION;
            const increment = target / (duration / 16);
            let current = 0;

            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.textContent = Math.ceil(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target % 1 === 0 ? target : target.toFixed(1);
                }
            };

            requestAnimationFrame(updateCounter);
        });
    },

    /**
     * Initialize navbar background on scroll
     */
    initNavbarScroll() {
        const navbar = document.querySelector('.navbar');
        if (!navbar) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) {
                navbar.style.backgroundColor = 'rgba(33, 37, 41, 1)';
            } else {
                navbar.style.backgroundColor = 'rgba(33, 37, 41, 0.95)';
            }
        }, { passive: true });
    },

    /**
     * Calculate price for given client count
     */
    calculatePrice(numClients) {
        const num = SecurityUtils.safeParseInt(numClients, 0);
        const tier = PRICING_TIERS.find(t => num >= t.min && num <= t.max);
        return tier ? tier.price : null;
    },

    /**
     * Handle plan selection
     */
    selectPlan(planName, price, maxClients) {
        // Validate inputs
        if (typeof planName !== 'string' || !planName) return;
        if (typeof price !== 'number' || price <= 0) return;
        if (typeof maxClients !== 'number' || maxClients <= 0) return;

        // Store selection (sanitized)
        sessionStorage.setItem('selectedPlan', JSON.stringify({
            name: SecurityUtils.sanitize(planName),
            price: Math.abs(price),
            maxClients: Math.abs(maxClients)
        }));

        window.location.href = 'checkout.html';
    },

    /**
     * Contact sales
     */
    contactSales() {
        window.location.href = 'mailto:sales@htrn85dns.com?subject=Enterprise%20Sales%20Inquiry&body=Hi%2C%20I%27m%20interested%20in%20an%20enterprise%20DNS%20Security%20plan.%20Please%20contact%20me.';
    },

    /**
     * Show price calculator prompt
     */
    showPriceCalculator() {
        const numClients = prompt('How many roaming clients do you need to protect?');

        if (!numClients) return;

        const num = SecurityUtils.safeParseInt(numClients, 0);

        if (!SecurityUtils.isValidNumber(num, CONFIG.MIN_CLIENTS, CONFIG.MAX_CLIENTS)) {
            alert('Please enter a number between 1 and 2000, or contact sales for custom pricing.');
            return;
        }

        const price = this.calculatePrice(num);
        if (price) {
            alert(`For ${num} clients, your annual cost is ${UIUtils.formatCurrency(price)}.`);
        } else {
            alert('Please contact sales for custom pricing over 2,000 clients.');
        }
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    LandingPage.init();
});

// Expose necessary functions to global scope for HTML onclick handlers
window.selectPlan = (name, price, max) => LandingPage.selectPlan(name, price, max);
window.contactSales = () => LandingPage.contactSales();
window.showPriceCalculator = () => LandingPage.showPriceCalculator();
window.showLoading = () => UIUtils.showLoading();
window.hideLoading = () => UIUtils.hideLoading();
