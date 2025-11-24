document.addEventListener('DOMContentLoaded', () => {
    
    // --- FORM HANDLING (EmailJS) ---
    const form = document.getElementById('contact-form');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('.submit-btn');
        const originalBtnText = submitBtn.innerHTML;
        
        // Show loading state
        submitBtn.innerHTML = 'Sending... <ion-icon name="hourglass-outline"></ion-icon>';
        submitBtn.disabled = true;

        // Prepare parameters for EmailJS
        // These keys must match your EmailJS template variables
        const templateParams = {
            from_name: document.getElementById('name').value,
            subject: document.getElementById('subject').value,
            message: document.getElementById('message').value,
            reply_to: 'sean.ward.7777@gmail.com' // Optional: if you want to capture their email, add an email input
        };

        // Send email
        // TODO: Replace 'YOUR_SERVICE_ID' and 'YOUR_TEMPLATE_ID' with actual values
        emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
            .then(() => {
                showToast("Message Sent Successfully!");
                form.reset();
            }, (error) => {
                console.error('FAILED...', error);
                showToast("Failed to send. Please try again.");
            })
            .finally(() => {
                // Reset button
                submitBtn.innerHTML = originalBtnText;
                submitBtn.disabled = false;
            });
    });


    // --- CLIPBOARD FUNCTIONALITY ---
    const phoneCard = document.getElementById('phone-card');
    const discordCard = document.getElementById('discord-card');
    
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copied to Clipboard!");
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    phoneCard.addEventListener('click', () => {
        copyToClipboard('+16192510366');
    });

    discordCard.addEventListener('click', () => {
        copyToClipboard('.mutatio');
    });

    // --- AVAILABILITY WIDGET ---
    updateAvailability();
    setInterval(updateAvailability, 60000); // Update every minute
});

function updateAvailability() {
    // Sean's Timezone: PST (UTC-8)
    // Simple logic: Awake between 7 AM and 11 PM
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const pstOffset = -8; 
    const pstTime = new Date(utc + (3600000 * pstOffset));
    
    const hours = pstTime.getHours();
    const minutes = pstTime.getMinutes();
    const isAwake = hours >= 7 && hours < 23;

    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    const timeDisplay = document.getElementById('pst-time');

    // Format time
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    
    timeDisplay.textContent = `${displayHours}:${displayMinutes} ${ampm}`;

    if (isAwake) {
        statusDot.classList.remove('asleep');
        statusText.textContent = "Currently: Awake & Coding";
        statusText.style.color = "#04fc43";
    } else {
        statusDot.classList.add('asleep');
        statusText.textContent = "Currently: Recharging";
        statusText.style.color = "#ff2942";
    }
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "show";
    setTimeout(function(){ toast.className = toast.className.replace("show", ""); }, 3000);
}
