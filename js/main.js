// Audience tab switcher
function switchAudience(track) {
  document.querySelectorAll('.audience-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.audience-content').forEach(c => c.classList.remove('active'));
  document.getElementById('track-' + track).classList.add('active');
  document.querySelector('[onclick*="' + track + '"]').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('active');
      toggle.classList.toggle('open');
    });

    // Close menu when clicking a link
    links.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('active');
        toggle.classList.remove('open');
      });
    });
  }

  // Navbar background on scroll
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    });
  }

  // Contact form handling → Zoho CRM + SendGrid notification
  const form = document.querySelector('.contact-form form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;

      try {
        const formData = new FormData(form);
        const payload = {
          name: formData.get('name'),
          email: formData.get('email'),
          company: formData.get('company'),
          interest: formData.get('interest'),
          message: formData.get('message')
        };

        const response = await fetch('/api/submit-trinity-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          btn.textContent = 'Sent!';
          form.reset();
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
          }, 3000);
        } else {
          throw new Error(result.error || 'Form submission failed');
        }
      } catch (err) {
        btn.textContent = 'Error - Try Again';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = originalText; }, 3000);
      }
    });
  }
});
