document.addEventListener('DOMContentLoaded', function() {
    const navbar = document.getElementById('navbar');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.getElementById('navMenu');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            
            const spans = this.querySelectorAll('span');
            if (navMenu.classList.contains('active')) {
                spans[0].style.transform = 'rotate(45deg) translateY(10px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translateY(-10px)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
        
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    navMenu.classList.remove('active');
                    const spans = mobileMenuToggle.querySelectorAll('span');
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            });
        });
    }
    
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -100px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    const animateElements = document.querySelectorAll('.service-card, .value-card, .team-member, .stat-card, .showcase-card, .contact-card');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
    
    // Show hero content and hide loader after video iframe loads
    const heroVideo = document.querySelector('.hero-video iframe');
    const heroContent = document.querySelector('.hero-content');
    const heroLoader = document.querySelector('.hero-loader');
    
    if (heroVideo && heroContent && heroLoader) {
        heroVideo.addEventListener('load', function() {
            // Add a small delay to ensure video starts playing
            setTimeout(function() {
                heroLoader.classList.add('hidden');
                setTimeout(function() {
                    heroContent.classList.add('loaded');
                }, 300);
            }, 1000);
        });
        
        // Fallback: show content after 3 seconds if iframe doesn't fire load event
        setTimeout(function() {
            if (!heroContent.classList.contains('loaded')) {
                heroLoader.classList.add('hidden');
                setTimeout(function() {
                    heroContent.classList.add('loaded');
                }, 300);
            }
        }, 3000);
    }
});
