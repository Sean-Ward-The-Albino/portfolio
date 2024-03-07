const cards = document.querySelectorAll('.card');

cards.forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.classList.add('active');
  });

  card.addEventListener('mouseleave', () => {
    card.classList.remove('active');
  });
});

function addMagic(card) {
  const content = card.querySelector('.card-content');
  const sparkles = document.createElement('div');
  sparkles.classList.add('sparkles'); // Add a class for styling

  // Add sparkles animation (using CSS animations)
  sparkles.style.animation = 'sparkle 2s infinite linear';

  // Append sparkles to card content
  content.appendChild(sparkles);

  // Remove sparkles on mouseleave
  card.addEventListener('mouseleave', () => {
    content.removeChild(sparkles);
  });
}

// Add magical effects to each card on mouseenter
cards.forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.classList.add('active');
    addMagic(card); // Call the addMagic function for current card
  });

  card.addEventListener('mouseleave', () => {
    card.classList.remove('active');
  });
});