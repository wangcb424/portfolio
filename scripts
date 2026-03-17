const backToTopButton = document.querySelector(".back-to-top");
const navLinks = document.querySelectorAll(".nav-links a");
const sections = document.querySelectorAll("main section[id]");

window.addEventListener("scroll", () => {
  if (window.scrollY > 300) {
    backToTopButton.style.opacity = "1";
  } else {
    backToTopButton.style.opacity = "0.7";
  }

  let currentSection = "";

  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 120;
    const sectionHeight = section.offsetHeight;

    if (
      window.scrollY >= sectionTop &&
      window.scrollY < sectionTop + sectionHeight
    ) {
      currentSection = section.getAttribute("id");
    }
  });

  navLinks.forEach((link) => {
    link.classList.remove("active");

    const href = link.getAttribute("href");
    if (href === `#${currentSection}`) {
      link.classList.add("active");
    }
  });
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});