(() => {
    const canvas = document.getElementById("heading-flock");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.warn("Cannot animate the flock: a 2D canvas context is unavailable.");
        return;
    }

    const BIRD_COUNT = 52;
    const EDGE_DISTANCE = 100;
    const PERSONAL_SPACE = 38;
    const FORMATION_RADIUS = 96;
    const FORMATION_SPACING = 17;
    const FORMATION_SEPARATION_LIMIT = 0.28;
    const OBSTACLE_CLEARANCE = 7;
    const OBSTACLE_LOOKAHEAD = 72;
    const NORMAL_SPEED = 1.28;
    const FOLLOW_SPEED = 3.8;
    const NORMAL_TURN_RATE = 0.042;
    const FOLLOW_TURN_RATE = 0.105;
    const OBSTACLE_TURN_RATE = 0.105;
    const FULL_TURN = Math.PI * 2;
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

    let width = Math.max(1, canvas.clientWidth);
    let height = Math.max(1, canvas.clientHeight);
    let frameId = null;
    let flockPlaced = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const obstacleElements = [...document.querySelectorAll("[data-flock-obstacle]")];
    const pointer = { x: 0, y: 0, active: false };
    const startingHeading = random(-0.45, 0.45);
    const birds = Array.from({ length: BIRD_COUNT }, (_, index) => {
        const angle = index * GOLDEN_ANGLE;
        const radius = Math.sqrt((index + 0.5) / BIRD_COUNT);
        return {
            x: random(width * 0.18, width * 0.82),
            y: random(height * 0.20, height * 0.80),
            z: random(-60, 130),
            angle: startingHeading + random(-0.30, 0.30),
            speed: random(1.0, 1.55),
            phase: random(0, FULL_TURN),
            size: random(7, 11),
            slotX: Math.cos(angle) * radius,
            slotY: Math.sin(angle) * radius
        };
    });

    function random(min, max) {
        return min + Math.random() * (max - min);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function angleDifference(from, to) {
        const difference = (to - from) % FULL_TURN;
        if (difference > Math.PI) return difference - FULL_TURN;
        if (difference < -Math.PI) return difference + FULL_TURN;
        return difference;
    }

    function resize() {
        const previousWidth = width;
        const previousHeight = height;
        width = Math.max(1, canvas.clientWidth);
        height = Math.max(1, canvas.clientHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineJoin = "round";

        for (const bird of birds) {
            bird.x *= width / previousWidth;
            bird.y *= height / previousHeight;
        }

        if (pointer.x >= width || pointer.y >= height) clearPointer();
        queueFrame();
    }

    function subtractObstacle(area, obstacle) {
        const left = Math.max(area.left, obstacle.left - OBSTACLE_CLEARANCE);
        const right = Math.min(area.right, obstacle.right + OBSTACLE_CLEARANCE);
        const top = Math.max(area.top, obstacle.top - OBSTACLE_CLEARANCE);
        const bottom = Math.min(area.bottom, obstacle.bottom + OBSTACLE_CLEARANCE);
        if (left >= right || top >= bottom) return [area];

        return [
            { ...area, bottom: top },
            { ...area, top: bottom },
            { left: area.left, right: left, top, bottom },
            { left: right, right: area.right, top, bottom }
        ].filter(rect => rect.left < rect.right && rect.top < rect.bottom);
    }

    function measureFlightLayout() {
        const obstacles = obstacleElements.map(element => element.getBoundingClientRect()).filter(rect =>
            rect.width > 0 && rect.height > 0 && rect.left < width && rect.right > 0 &&
            rect.top < height && rect.bottom > 0);
        const marginX = Math.min(3, width / 2);
        const marginY = Math.min(3, height / 2);
        const bounds = { left: marginX, right: width - marginX, top: marginY, bottom: height - marginY };
        let areas = [bounds];
        for (const obstacle of obstacles) {
            areas = areas.flatMap(area => subtractObstacle(area, obstacle));
        }
        return { obstacles, bounds, areas };
    }

    function containsPoint(area, x, y) {
        return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
    }

    function canFlyAt(areas, x, y) {
        return areas.some(area => containsPoint(area, x, y));
    }

    function nearestFlightPoint(areas, x, y) {
        let nearest;
        let bestDistance = Infinity;
        for (const area of areas) {
            const pointX = clamp(x, area.left, area.right);
            const pointY = clamp(y, area.top, area.bottom);
            const distance = Math.hypot(x - pointX, y - pointY);
            if (distance < bestDistance) {
                nearest = { x: pointX, y: pointY, area };
                bestDistance = distance;
            }
        }
        return nearest;
    }

    function placeFlock(areas) {
        for (const bird of birds) {
            if (canFlyAt(areas, bird.x, bird.y)) continue;

            // Scrolling or resizing can put an obstacle over an existing bird.
            const nearest = nearestFlightPoint(areas, bird.x, bird.y);
            bird.x = flockPlaced ? nearest.x : random(nearest.area.left, nearest.area.right);
            bird.y = flockPlaced ? nearest.y : random(nearest.area.top, nearest.area.bottom);
        }
        flockPlaced = true;
    }

    function obstacleOffset(obstacle, x, y) {
        return [x - clamp(x, obstacle.left, obstacle.right), y - clamp(y, obstacle.top, obstacle.bottom)];
    }

    function steerAroundObstacles(bird, heading, obstacles) {
        for (const obstacle of obstacles) {
            const [dx, dy] = obstacleOffset(obstacle, bird.x, bird.y);
            const distance = Math.hypot(dx, dy);
            if (distance >= OBSTACLE_LOOKAHEAD) continue;

            const outwardHeading = Math.atan2(dy, dx);
            const approach = angleDifference(outwardHeading, heading);
            if (Math.abs(approach) > Math.PI / 2) {
                const tangent = Math.sign(approach) * Math.PI / 2;
                const strength = 1 - (distance - OBSTACLE_CLEARANCE) / (OBSTACLE_LOOKAHEAD - OBSTACLE_CLEARANCE);
                heading += (tangent - approach) * strength;
            }
        }
        return heading;
    }

    function planFollowRoutes(areas) {
        const destination = nearestFlightPoint(areas, pointer.x, pointer.y).area;
        const routes = [{ area: destination, portal: null }];
        const visited = new Set([destination]);

        // Search outward from the goal so the flock shares the same route through each opening.
        for (const { area: nextArea } of routes) {
            for (const area of areas) {
                if (visited.has(area)) continue;

                const left = Math.max(area.left, nextArea.left);
                const right = Math.min(area.right, nextArea.right);
                const top = Math.max(area.top, nextArea.top);
                const bottom = Math.min(area.bottom, nextArea.bottom);
                if (left > right || top > bottom || (left === right && top === bottom)) continue;

                visited.add(area);
                routes.push({ area, nextArea, portal: { left, right, top, bottom } });
            }
        }
        return routes;
    }

    function formationPoint(bird, area) {
        const spreadX = Math.min(FORMATION_RADIUS, (area.right - area.left) / 2);
        const spreadY = Math.min(FORMATION_RADIUS, (area.bottom - area.top) / 2);
        return {
            x: clamp(pointer.x, area.left + spreadX, area.right - spreadX) + bird.slotX * spreadX,
            y: clamp(pointer.y, area.top + spreadY, area.bottom - spreadY) + bird.slotY * spreadY
        };
    }

    function followPoint(bird, areas, routes) {
        const route = routes.find(({ area }) => containsPoint(area, bird.x, bird.y));
        if (!route) {
            // An obstacle spanning the viewport can split flight space into separate groups.
            return formationPoint(bird, areas.find(area => containsPoint(area, bird.x, bird.y)));
        }
        if (!route.portal) return formationPoint(bird, route.area);

        const { portal, nextArea } = route;
        const target = formationPoint(bird, portal);
        // Once lined up, aim just past the opening to fly through it instead of stopping on it.
        if (portal.left === portal.right && bird.y >= portal.top && bird.y <= portal.bottom) {
            const inset = Math.min(14, (nextArea.right - nextArea.left) / 2);
            target.x = clamp(target.x, nextArea.left + inset, nextArea.right - inset);
        } else if (portal.top === portal.bottom && bird.x >= portal.left && bird.x <= portal.right) {
            const inset = Math.min(14, (nextArea.bottom - nextArea.top) / 2);
            target.y = clamp(target.y, nextArea.top + inset, nextArea.bottom - inset);
        }
        return { ...target, throughPortal: true };
    }

    function drawBird(bird, time, obstacles) {
        const { x, y, z, angle, size, phase } = bird;
        const perspective = 430 / (430 + z);
        const wingSpan = size * (0.95 + Math.sin(time * 0.011 + phase) * 0.25);
        const meshRadius = Math.max(size * 0.95, Math.hypot(size * 0.08, wingSpan));
        let scale = perspective;
        // Fit the entire wireframe through narrow gutters without clipping its wings.
        for (const obstacle of obstacles) {
            const [dx, dy] = obstacleOffset(obstacle, x, y);
            const clearance = Math.hypot(dx, dy) - 1;
            scale = Math.min(scale, clearance / (meshRadius + 0.4));
        }
        const cos = Math.cos(angle) * scale;
        const sin = Math.sin(angle) * scale;
        const noseX = x + size * 0.95 * cos;
        const noseY = y + size * 0.95 * sin;
        const tailX = x - size * 0.68 * cos;
        const tailY = y - size * 0.68 * sin;
        const wingX = x - size * 0.08 * cos;
        const wingY = y - size * 0.08 * sin;

        ctx.beginPath();
        ctx.moveTo(noseX, noseY);
        ctx.lineTo(wingX + wingSpan * sin, wingY - wingSpan * cos);
        ctx.lineTo(tailX, tailY);
        ctx.lineTo(wingX - wingSpan * sin, wingY + wingSpan * cos);
        ctx.closePath();
        ctx.moveTo(noseX, noseY);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.92, 0.42 + perspective * 0.32)})`;
        ctx.lineWidth = Math.max(0.6, scale * 0.8);
        ctx.stroke();
    }

    function steerFromEdge(heading, distance, threshold, inwardHeading) {
        if (distance >= threshold) return heading;

        const strength = 1 - distance / threshold;
        return heading + angleDifference(heading, inwardHeading) * (0.035 + strength * 0.15);
    }

    function moveBird(bird, bounds, areas, following) {
        const vx = Math.cos(bird.angle) * bird.speed;
        const vy = Math.sin(bird.angle) * bird.speed;
        const nextX = bird.x + vx;
        const nextY = bird.y + vy;
        const x = clamp(nextX, bounds.left, bounds.right);
        const y = clamp(nextY, bounds.top, bounds.bottom);

        if (!canFlyAt(areas, x, y)) {
            // Slide along the obstacle if a cursor or flock impulse would cross it.
            const slideX = canFlyAt(areas, x, bird.y) ? x - bird.x : 0;
            const slideY = canFlyAt(areas, bird.x, y) ? y - bird.y : 0;
            if (Math.abs(slideX) > Math.abs(slideY)) {
                bird.x += slideX;
                if (!following) bird.angle = slideX > 0 ? 0 : Math.PI;
            } else if (slideY !== 0) {
                bird.y += slideY;
                if (!following) bird.angle = slideY > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
            return;
        }

        bird.x = x;
        bird.y = y;
        // During pursuit, let the bird finish turning toward its waypoint even in a tight lane.
        if (!following && (x !== nextX || y !== nextY)) {
            bird.angle = Math.atan2(y === nextY ? vy : -vy, x === nextX ? vx : -vx);
        }
    }

    function updateFlock(time, { obstacles, bounds, areas }) {
        let centerX = 0;
        let centerY = 0;
        let headingX = 0;
        let headingY = 0;

        for (const bird of birds) {
            centerX += bird.x;
            centerY += bird.y;
            headingX += Math.cos(bird.angle);
            headingY += Math.sin(bird.angle);
        }

        centerX /= birds.length;
        centerY /= birds.length;
        const flockHeading = Math.atan2(headingY, headingX);
        const edgeX = Math.min(EDGE_DISTANCE, width / 2);
        const edgeY = Math.min(EDGE_DISTANCE, height / 2);
        const following = pointer.active;
        const routes = following ? planFollowRoutes(areas) : null;
        const spacing = following ? FORMATION_SPACING : PERSONAL_SPACE;

        for (const bird of birds) {
            let desiredHeading = bird.angle;
            let targetSpeed = NORMAL_SPEED;

            if (routes) {
                const target = followPoint(bird, areas, routes);
                const dx = target.x - bird.x;
                const dy = target.y - bird.y;
                const distance = Math.hypot(dx, dy);
                if (distance > (target.throughPortal ? 0 : 1)) {
                    desiredHeading = Math.atan2(dy, dx);
                    const turn = angleDifference(bird.angle, desiredHeading);
                    targetSpeed = Math.min(FOLLOW_SPEED, distance * 0.075) * Math.max(0, Math.cos(turn));
                } else {
                    desiredHeading = flockHeading;
                    targetSpeed = 0;
                }
            } else {
                const centerDX = centerX - bird.x;
                const centerDY = centerY - bird.y;
                const centerDistance = Math.hypot(centerDX, centerDY);
                if (centerDistance > 110) {
                    const cohesion = Math.min(0.16, centerDistance * 0.00055);
                    desiredHeading += angleDifference(desiredHeading, Math.atan2(centerDY, centerDX)) * cohesion;
                }
                desiredHeading += angleDifference(desiredHeading, flockHeading) * 0.045;
            }

            const headingBeforeSeparation = desiredHeading;
            for (const other of birds) {
                if (other === bird) continue;

                const dx = bird.x - other.x;
                const dy = bird.y - other.y;
                const distance = Math.hypot(dx, dy);
                if (distance < spacing && distance > 0.01) {
                    const strength = 1 - distance / spacing;
                    desiredHeading += angleDifference(desiredHeading, Math.atan2(dy, dx)) * strength * 0.09;
                }
            }

            let turnRate = FOLLOW_TURN_RATE;
            if (following) {
                const correction = angleDifference(headingBeforeSeparation, desiredHeading);
                desiredHeading = headingBeforeSeparation +
                    clamp(correction, -FORMATION_SEPARATION_LIMIT, FORMATION_SEPARATION_LIMIT);
            } else {
                desiredHeading = steerFromEdge(desiredHeading, bird.x, edgeX, 0);
                desiredHeading = steerFromEdge(desiredHeading, width - bird.x, edgeX, Math.PI);
                desiredHeading = steerFromEdge(desiredHeading, bird.y, edgeY, Math.PI / 2);
                desiredHeading = steerFromEdge(desiredHeading, height - bird.y, edgeY, -Math.PI / 2);
                const obstacleHeading = steerAroundObstacles(bird, desiredHeading, obstacles);
                turnRate = obstacleHeading === desiredHeading ? NORMAL_TURN_RATE : OBSTACLE_TURN_RATE;
                desiredHeading = obstacleHeading;
            }
            bird.angle += clamp(angleDifference(bird.angle, desiredHeading), -turnRate, turnRate);
            bird.speed += (targetSpeed - bird.speed) * (following ? 0.09 : 0.035);

            moveBird(bird, bounds, areas, following);
            bird.z += Math.sin(time * 0.0008 + bird.phase) * 0.009;
        }
    }

    function drawPointerGlow() {
        const { x, y } = pointer;
        const radius = 70;
        const gradient = ctx.createRadialGradient(x, y, 2, x, y, radius);
        gradient.addColorStop(0, "rgba(80,210,255,0.12)");
        gradient.addColorStop(1, "rgba(80,210,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    function drawFlock(time, showGlow, { obstacles, areas }) {
        ctx.clearRect(0, 0, width, height);
        if (areas.length) {
            for (const bird of birds.slice().sort((a, b) => b.z - a.z)) {
                drawBird(bird, time, obstacles);
            }
        }
        if (showGlow && pointer.active) drawPointerGlow();
    }

    function animate(timestamp) {
        frameId = null;
        const layout = measureFlightLayout();
        const stationary = reducedMotion.matches;
        if (layout.areas.length) {
            placeFlock(layout.areas);
            if (!stationary) updateFlock(timestamp, layout);
        }

        drawFlock(stationary ? 0 : timestamp, !stationary, layout);
        if (!stationary) queueFrame();
    }

    function queueFrame() {
        if (frameId === null) frameId = requestAnimationFrame(animate);
    }

    function clearPointer() {
        pointer.active = false;
    }

    function updatePointer(event) {
        // The fixed canvas shares the viewport's origin even when the page scrolls.
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.active = event.pointerType === "mouse" && pointer.x >= 0 && pointer.x < width &&
            pointer.y >= 0 && pointer.y < height;
        if (pointer.active && frameId === null && !reducedMotion.matches) queueFrame();
    }

    // Capture page events without making the canvas a pointer target.
    window.addEventListener("pointermove", updatePointer, { capture: true, passive: true });
    window.addEventListener("pointerdown", updatePointer, { capture: true, passive: true });
    window.addEventListener("scroll", queueFrame, { passive: true });
    document.documentElement.addEventListener("pointerleave", clearPointer);
    window.addEventListener("blur", clearPointer);

    resize();
    new ResizeObserver(resize).observe(canvas);
    const obstacleObserver = new ResizeObserver(queueFrame);
    for (const element of obstacleElements) obstacleObserver.observe(element);
    reducedMotion.addEventListener("change", queueFrame);
})();
