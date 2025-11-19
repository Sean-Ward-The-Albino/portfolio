// Function to handle counting animation for metric numbers
function animateCounters() {
    const metricCards = document.querySelectorAll('.metric-card');
    
    metricCards.forEach((card, index) => {
        const numberElement = card.querySelector('.metric-number');
        const finalValue = parseInt(numberElement.getAttribute('data-final')); 
        
        const duration = 1500; 
        const startTime = performance.now();

        function updateCount(currentTime) {
            const elapsedTime = currentTime - startTime;
            const progress = Math.min(elapsedTime / duration, 1);
            
            const currentValue = Math.floor(progress * finalValue);
            
            // Logic for CEO, Mastery, etc. 
            if (index === 0) { 
                numberElement.textContent = currentValue >= 1 ? 'CEO' : '0';
            } else if (index === 3) { 
                numberElement.textContent = currentValue >= 1 ? 'Mastery' : '0';
            } else if (index === 1) { 
                numberElement.textContent = currentValue >= 1 ? '1' : '0';
            } else {
                numberElement.textContent = currentValue;
            }

            if (progress < 1) {
                requestAnimationFrame(updateCount);
            }
        }
        
        
        setTimeout(() => {
            requestAnimationFrame(updateCount);
        }, 2000 + (index * 100)); 
    });
}


// Function: Animates the knowledge bars one at a time
function animateKnowledgeBars() {
    const techBars = document.querySelectorAll('.tech-bar-container');
    
    techBars.forEach((bar, index) => {
        const level = bar.getAttribute('data-level');
        
        
        const delay = 1500 + (index * 300); // Start after fade-in
        setTimeout(() => {
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                .tech-bar-container[data-level="${level}"] .knowledge-bar::before {
                    width: ${level}%;
                    opacity: 1; /* Fade in the bar */
                }
            `;
            document.head.appendChild(styleElement);
            
        }, delay);
    });
}


// Initializer
document.addEventListener('DOMContentLoaded', () => {
    // Only run if the elements are present (i.e., we are on the home page)
    if (document.querySelector('.metrics-section')) {
        animateCounters();
    }
    if (document.querySelector('.tech-chime')) {
        animateKnowledgeBars(); 
    }
});