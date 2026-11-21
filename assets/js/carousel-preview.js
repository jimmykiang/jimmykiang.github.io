(() => {
    if (!window.bootstrap?.Modal || !window.bootstrap?.Carousel) {
        console.warn("The carousel preview requires Bootstrap.");
        return;
    }

    const carousel = document.getElementById("carouselExampleIndicators");
    const slot = carousel.parentElement;
    const expand = slot.querySelector(".carousel-expand");
    const dialog = document.getElementById("carousel-preview");
    const dialogBody = dialog.querySelector(".modal-body");
    const preview = new bootstrap.Modal(dialog);

    dialog.addEventListener("show.bs.modal", () => {
        bootstrap.Carousel.getOrCreateInstance(carousel).pause();
        document.documentElement.classList.add("carousel-preview-open");
        expand.setAttribute("aria-expanded", "true");

        // Move rather than copy the carousel so the live demos keep their state.
        dialogBody.append(carousel);
    });

    dialog.addEventListener("hide.bs.modal", () => {
        expand.setAttribute("aria-expanded", "false");
    });

    dialog.addEventListener("hidden.bs.modal", () => {
        slot.prepend(carousel);
        document.documentElement.classList.remove("carousel-preview-open");
        bootstrap.Carousel.getInstance(carousel).cycle();
        expand.focus({ preventScroll: true });
    });

    expand.addEventListener("click", () => preview.show(expand));
    carousel.addEventListener("click", event => {
        if (event.defaultPrevented || event.button !== 0 ||
            event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
            !event.target.matches(".carousel-item.active:not(.carousel-item-start, .carousel-item-end) > img")) {
            return;
        }

        if (carousel.parentElement === dialogBody) {
            preview.hide();
        } else {
            preview.show(expand);
        }
    });

    const fallingBall = carousel.querySelector("#glcanvas");
    new ResizeObserver(() => {
        // The WebGL demo normally updates its drawing buffer only on a window resize.
        if (fallingBall.clientWidth > 0 && fallingBall.clientHeight > 0) {
            window.dispatchEvent(new Event("resize"));
        }
    }).observe(fallingBall);

    carousel.classList.add("carousel-preview-enabled");
    expand.hidden = false;
})();
