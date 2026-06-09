console.log("TZOUR Portfolio Loaded");

window.addEventListener("scroll", () => {
    const cards = document.querySelectorAll(".project-card");

    cards.forEach(card => {
        const position = card.getBoundingClientRect().top;

        if(position < window.innerHeight - 100){
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";
        }
    });
});