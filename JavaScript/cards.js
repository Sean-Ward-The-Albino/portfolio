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
  sparkles.classList.add('sparkles'); 

  
  sparkles.style.animation = 'sparkle 2s infinite linear';

 
  content.appendChild(sparkles);

  card.addEventListener('mouseleave', () => {
    content.removeChild(sparkles);
  });
}

cards.forEach(card => {
  card.addEventListener('mouseenter', () => {
    card.classList.add('active');
    addMagic(card); 
  });

  card.addEventListener('mouseleave', () => {
    card.classList.remove('active');
  });
});