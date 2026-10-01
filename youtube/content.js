console.log(
    "Voice Assistant loaded on YouTube"
);


// ==========================================
// NORMALIZARE TEXT
// ==========================================

function normalizeText(text) {

    return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}


// ==========================================
// VIDEOCLIPURI / CANDIDAȚI DIN PAGINA YOUTUBE
//
// YouTube își schimbă periodic structura DOM.
// De aceea nu ne bazăm pe un singur selector.
// Suportăm atât componentele vechi ytd-*,
// cât și noile componente yt-lockup-view-model.
// ==========================================

function getVideoCandidates() {

    const containerSelectors = [
        "ytd-video-renderer",
        "ytd-compact-video-renderer",
        "ytd-rich-item-renderer",
        "ytd-grid-video-renderer",
        "ytd-playlist-video-renderer",
        "yt-lockup-view-model"
    ];

    const titleLinkSelectors = [
        "a#video-title",
        "a#video-title-link",
        "a.yt-lockup-metadata-view-model__title",
        "a[href*='/watch'][title]",
        "a[href*='/watch'][aria-label]"
    ];

    const candidates = [];
    const seenUrls = new Set();

    const containers =
        Array.from(
            document.querySelectorAll(
                containerSelectors.join(",")
            )
        );

    for (const container of containers) {

        let link = null;

        for (const selector of titleLinkSelectors) {

            const found =
                container.querySelector(selector);

            if (
                found &&
                found.href &&
                found.href.includes("/watch")
            ) {

                link = found;
                break;
            }
        }

        // Fallback: orice link /watch din card.
        if (!link) {

            link =
                Array.from(
                    container.querySelectorAll(
                        "a[href*='/watch']"
                    )
                )
                .find(
                    item =>
                        item.href &&
                        item.href.includes("/watch")
                );
        }

        if (!link) {
            continue;
        }

        const title =
            getVideoTitleFromElements(
                link,
                container
            );

        if (!title) {
            continue;
        }

        if (seenUrls.has(link.href)) {
            continue;
        }

        seenUrls.add(link.href);

        candidates.push({
            link,
            container,
            title
        });
    }


    // Fallback suplimentar pentru variante YouTube noi
    // care nu folosesc containerele de mai sus.
    const fallbackLinks =
        Array.from(
            document.querySelectorAll(
                "a[href*='/watch']"
            )
        );

    for (const link of fallbackLinks) {

        if (
            !link.href ||
            !link.href.includes("/watch") ||
            seenUrls.has(link.href)
        ) {
            continue;
        }

        const container =
            link.closest(
                "yt-lockup-view-model, " +
                "ytd-video-renderer, " +
                "ytd-compact-video-renderer, " +
                "ytd-rich-item-renderer, " +
                "ytd-grid-video-renderer, " +
                "ytd-playlist-video-renderer"
            ) ||
            link.parentElement;

        const title =
            getVideoTitleFromElements(
                link,
                container
            );

        if (!title) {
            continue;
        }

        seenUrls.add(link.href);

        candidates.push({
            link,
            container,
            title
        });
    }


    return candidates;
}


// ==========================================
// EXTRAGE TITLUL VIDEOCLIPULUI
// ==========================================

function getVideoTitleFromElements(
    link,
    container
) {

    const directTitle =
        (
            link.getAttribute("title") ||
            link.getAttribute("aria-label") ||
            link.textContent ||
            ""
        ).trim();

    if (directTitle) {
        return directTitle;
    }


    if (container) {

        const titleElement =
            container.querySelector(
                "#video-title, " +
                "#video-title-link, " +
                ".yt-lockup-metadata-view-model__title, " +
                "[title][href*='/watch'], " +
                "[aria-label][href*='/watch']"
            );

        if (titleElement) {

            const text =
                (
                    titleElement.getAttribute("title") ||
                    titleElement.getAttribute("aria-label") ||
                    titleElement.textContent ||
                    ""
                ).trim();

            if (text) {
                return text;
            }
        }
    }


    return "";
}


// ==========================================
// VERIFICĂ DACĂ UN ELEMENT ESTE VIZIBIL PE ECRAN
// ==========================================

function isVisibleOnScreen(element) {

    if (!element) {
        return false;
    }

    const style =
        window.getComputedStyle(element);

    if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0
    ) {
        return false;
    }

    const rect =
        element.getBoundingClientRect();

    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
    );
}


// ==========================================
// TOATE LINKURILE CĂTRE VIDEOCLIPURI
// ==========================================

function getVideoLinks() {

    return getVideoCandidates()
        .map(candidate => candidate.link);
}


// ==========================================
// VIDEOCLIPURI VIZIBILE ACUM
// ==========================================

function getVisibleVideoCandidates() {

    return getVideoCandidates()
        .filter(
            candidate =>
                isVisibleOnScreen(
                    candidate.container
                ) ||
                isVisibleOnScreen(
                    candidate.link
                )
        );
}


function getVisibleVideoLinks() {

    return getVisibleVideoCandidates()
        .map(candidate => candidate.link);
}


// ==========================================
// TITLUL UNUI LINK VIDEO
// ==========================================

function getVideoTitle(link) {

    const candidate =
        getVideoCandidates()
            .find(
                item =>
                    item.link === link ||
                    item.link.href === link.href
            );

    if (candidate) {
        return candidate.title;
    }

    return (
        link.getAttribute("title") ||
        link.getAttribute("aria-label") ||
        link.textContent ||
        ""
    ).trim();
}


// ==========================================
// GĂSEȘTE CEL MAI BUN VIDEO DUPĂ TITLUL SPUS
// ==========================================

function findBestVideoByTitle(query) {

    const normalizedQuery =
        normalizeText(query);

    if (!normalizedQuery) {
        return null;
    }

    // Preferăm întotdeauna ce este vizibil pe ecran.
    let candidates =
        getVisibleVideoCandidates();

    // Dacă nu detectăm nimic vizibil,
    // folosim toate videoclipurile încărcate.
    if (candidates.length === 0) {
        candidates =
            getVideoCandidates();
    }


    console.log(
        "Video candidates:",
        candidates.map(
            candidate => candidate.title
        )
    );


    const queryWords =
        normalizedQuery
            .split(" ")
            .filter(
                word =>
                    word.length > 1
            );

    // Ajută la cazuri precum:
    // "B.U.G. Mafia" vs "bug mafia"
    const compactQuery =
        normalizedQuery
            .replace(/\s+/g, "");


    let best = null;
    let bestScore = 0;


    for (const candidate of candidates) {

        const normalizedTitle =
            normalizeText(
                candidate.title
            );

        if (!normalizedTitle) {
            continue;
        }


        const compactTitle =
            normalizedTitle
                .replace(/\s+/g, "");


        let score = 0;


        // Potrivire foarte bună.
        if (
            normalizedTitle.includes(
                normalizedQuery
            ) ||
            compactTitle.includes(
                compactQuery
            )
        ) {

            score = 100;

        } else {

            const titleWords =
                new Set(
                    normalizedTitle
                        .split(" ")
                        .filter(
                            word =>
                                word.length > 1
                        )
                );


            const matches =
                queryWords.filter(
                    word =>
                        titleWords.has(word)
                ).length;


            if (queryWords.length > 0) {

                score =
                    matches /
                    queryWords.length;
            }
        }


        console.log(
            "Matching:",
            {
                query:
                    normalizedQuery,
                title:
                    candidate.title,
                score
            }
        );


        if (score > bestScore) {

            bestScore = score;

            best = {
                link:
                    candidate.link,
                title:
                    candidate.title,
                score
            };
        }
    }


    if (
        best &&
        (
            best.score === 100 ||
            best.score >= 0.5
        )
    ) {

        return best;
    }


    return null;
}


// ==========================================
// VIDEOCLIPUL PRINCIPAL YOUTUBE
// ==========================================

function getMainVideo() {

    return (
        document.querySelector(
            "video.html5-main-video"
        ) ||
        document.querySelector(
            "video"
        )
    );
}


// ==========================================
// PLAYERUL PRINCIPAL YOUTUBE
// ==========================================

function getYouTubePlayer() {

    return (
        document.querySelector("#movie_player") ||
        document.querySelector(".html5-video-player") ||
        getMainVideo()?.parentElement ||
        null
    );
}


// ==========================================
// FULLSCREEN PENTRU PLAYERUL YOUTUBE
//
// Nu folosim requestFullscreen(), deoarece comenzile vocale
// nu sunt considerate întotdeauna "user gesture" de Chrome.
//
// Soluția:
// 1. memorăm locul original al #movie_player;
// 2. creăm un overlay fix peste întreaga pagină;
// 3. mutăm playerul YouTube în overlay;
// 4. la ieșire îl punem exact înapoi.
// ==========================================

let voiceFullscreenState = {
    active: false,
    player: null,
    originalParent: null,
    originalNextSibling: null,
    placeholder: null,
    overlay: null,
    scrollX: 0,
    scrollY: 0
};


// ==========================================
// CREEAZĂ CSS-UL PENTRU MODUL FULLSCREEN
// ==========================================

function ensureVoiceFullscreenStyle() {

    let style =
        document.getElementById(
            "voice-assistant-fullscreen-style"
        );


    if (style) {
        return style;
    }


    style =
        document.createElement("style");

    style.id =
        "voice-assistant-fullscreen-style";


    style.textContent = `
        #voice-assistant-fullscreen-overlay {
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            left: 0 !important;

            width: 100vw !important;
            height: 100vh !important;

            margin: 0 !important;
            padding: 0 !important;

            background: #000 !important;

            z-index: 2147483647 !important;

            display: flex !important;
            align-items: center !important;
            justify-content: center !important;

            overflow: hidden !important;
        }


        #voice-assistant-fullscreen-overlay
        > .voice-assistant-detached-player {

            position: relative !important;

            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;

            width: 100vw !important;
            height: 100vh !important;

            min-width: 100vw !important;
            min-height: 100vh !important;

            max-width: 100vw !important;
            max-height: 100vh !important;

            margin: 0 !important;

            transform: none !important;

            background: #000 !important;
        }


        #voice-assistant-fullscreen-overlay
        .html5-video-container {

            width: 100% !important;
            height: 100% !important;
        }


        #voice-assistant-fullscreen-overlay
        video.html5-main-video,
        #voice-assistant-fullscreen-overlay
        video {

            position: absolute !important;

            top: 0 !important;
            left: 0 !important;

            width: 100% !important;
            height: 100% !important;

            max-width: none !important;
            max-height: none !important;

            object-fit: contain !important;

            background: #000 !important;
        }


        html.voice-assistant-fullscreen-active,
        body.voice-assistant-fullscreen-active {

            overflow: hidden !important;
        }
    `;


    document.documentElement.appendChild(
        style
    );


    return style;
}


// ==========================================
// INTRĂ ÎN FULLSCREEN ÎN INTERIORUL PAGINII
// ==========================================

function enterPageFullscreen(player) {

    if (!player) {
        return false;
    }


    // Dacă suntem deja în acest mod, nu mai mutăm nimic.
    if (
        voiceFullscreenState.active &&
        voiceFullscreenState.player === player
    ) {

        return true;
    }


    // Curățăm o stare veche, dacă a rămas cumva activă.
    if (voiceFullscreenState.active) {

        exitPageFullscreen();
    }


    ensureVoiceFullscreenStyle();


    const originalParent =
        player.parentNode;


    if (!originalParent) {
        return false;
    }


    // Comentariul acesta marchează exact locul în care
    // trebuie pus playerul când ieșim din fullscreen.
    const placeholder =
        document.createComment(
            "voice-assistant-player-placeholder"
        );


    originalParent.insertBefore(
        placeholder,
        player
    );


    const overlay =
        document.createElement("div");

    overlay.id =
        "voice-assistant-fullscreen-overlay";


    // Memorăm starea înainte să mutăm playerul.
    voiceFullscreenState = {
        active: true,
        player,
        originalParent,
        originalNextSibling:
            placeholder.nextSibling,
        placeholder,
        overlay,
        scrollX:
            window.scrollX,
        scrollY:
            window.scrollY
    };


    // Mutăm efectiv playerul în afara layout-ului YouTube.
    overlay.appendChild(
        player
    );


    player.classList.add(
        "voice-assistant-detached-player"
    );


    document.documentElement.classList.add(
        "voice-assistant-fullscreen-active"
    );

    document.body.classList.add(
        "voice-assistant-fullscreen-active"
    );


    document.body.appendChild(
        overlay
    );


    // Forțăm YouTube să recalculeze dimensiunile playerului.
    window.dispatchEvent(
        new Event("resize")
    );


    setTimeout(
        () => {

            window.dispatchEvent(
                new Event("resize")
            );

        },
        100
    );


    return true;
}


// ==========================================
// IEȘIRE DIN FULLSCREEN ÎN INTERIORUL PAGINII
// ==========================================

function exitPageFullscreen() {

    if (!voiceFullscreenState.active) {

        return false;
    }


    const {
        player,
        originalParent,
        placeholder,
        overlay,
        scrollX,
        scrollY
    } = voiceFullscreenState;


    try {

        if (player) {

            player.classList.remove(
                "voice-assistant-detached-player"
            );


            // Varianta preferată:
            // punem playerul exact înaintea placeholder-ului.
            if (
                placeholder &&
                placeholder.parentNode
            ) {

                placeholder.parentNode.insertBefore(
                    player,
                    placeholder
                );


                placeholder.remove();

            } else if (
                originalParent &&
                originalParent.isConnected
            ) {

                // Fallback în cazul în care YouTube a modificat DOM-ul.
                originalParent.appendChild(
                    player
                );
            }
        }


        if (
            overlay &&
            overlay.isConnected
        ) {

            overlay.remove();
        }


        document.documentElement.classList.remove(
            "voice-assistant-fullscreen-active"
        );

        document.body.classList.remove(
            "voice-assistant-fullscreen-active"
        );


        voiceFullscreenState = {
            active: false,
            player: null,
            originalParent: null,
            originalNextSibling: null,
            placeholder: null,
            overlay: null,
            scrollX: 0,
            scrollY: 0
        };


        // Refacem poziția paginii și layout-ul YouTube.
        window.scrollTo(
            scrollX,
            scrollY
        );


        window.dispatchEvent(
            new Event("resize")
        );


        setTimeout(
            () => {

                window.dispatchEvent(
                    new Event("resize")
                );

            },
            100
        );


        return true;

    } catch (error) {

        console.error(
            "Exit page fullscreen error:",
            error
        );


        return false;
    }
}


// ==========================================
// MESAJELOR DIN SIDE PANEL
// ==========================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {



        // ==================================
        // ÎNAPOI ÎN ISTORIC
        // Funcționează bine și pentru navigarea SPA YouTube.
        // ==================================

        if (
            message.type ===
            "GO_BACK"
        ) {

            sendResponse({
                success: true,
                message:
                    "⬅️ Revin la pagina anterioară."
            });


            setTimeout(
                () => {
                    window.history.back();
                },
                50
            );


            return;
        }


        // ==================================
        // SCROLL PAGINĂ
        // ==================================

        if (
            message.type ===
            "SCROLL_PAGE"
        ) {

            const direction =
                message.direction === "up"
                    ? -1
                    : 1;

            const distance =
                Math.round(
                    window.innerHeight * 0.8
                );

            window.scrollBy({
                top:
                    direction * distance,
                left: 0,
                behavior: "smooth"
            });

            sendResponse({
                success: true,
                message:
                    direction > 0
                        ? "⬇️ Scroll în jos."
                        : "⬆️ Scroll în sus."
            });

            return;
        }


        // ==================================
        // DESCHIDE VIDEOCLIP DUPĂ NUMĂR
        // Din rezultatele normale ale căutării
        // ==================================

        if (
            message.type ===
            "PLAY_VIDEO_BY_INDEX"
        ) {

            const index =
                message.index - 1;

            const videos =
                getVideoLinks();

            if (
                index < 0 ||
                index >= videos.length
            ) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul " +
                        message.index
                });

                return;
            }

            const selectedVideo =
                videos[index];

            const title =
                getVideoTitle(
                    selectedVideo
                );

            sendResponse({
                success: true,
                message:
                    "▶️ Deschid: " +
                    title
            });

            selectedVideo.click();

            return;
        }


        // ==================================
        // DESCHIDE VIDEOCLIP VIZIBIL DUPĂ NUMĂR
        // Ex: "pune al doilea de pe ecran"
        // ==================================

        if (
            message.type ===
            "PLAY_VISIBLE_VIDEO_BY_INDEX"
        ) {

            const index =
                message.index - 1;

            const videos =
                getVisibleVideoLinks();

            if (
                index < 0 ||
                index >= videos.length
            ) {

                sendResponse({
                    success: false,
                    message:
                        "Nu văd videoclipul " +
                        message.index +
                        " pe ecran."
                });

                return;
            }

            const selectedVideo =
                videos[index];

            const title =
                getVideoTitle(
                    selectedVideo
                );

            sendResponse({
                success: true,
                message:
                    "▶️ Deschid: " +
                    title
            });

            selectedVideo.click();

            return;
        }


        // ==================================
        // DESCHIDE VIDEOCLIP DUPĂ TITLUL ROSTIT
        // Ex: "pune blinding lights"
        // ==================================

        if (
            message.type ===
            "PLAY_VIDEO_BY_TITLE"
        ) {

            const match =
                findBestVideoByTitle(
                    message.query
                );

            if (!match) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit pe ecran un videoclip care să semene cu «" +
                        message.query +
                        "»."
                });

                return;
            }

            sendResponse({
                success: true,
                message:
                    "▶️ Deschid: " +
                    match.title
            });

            match.link.click();

            return;
        }




        // ==================================
        // FULLSCREEN ÎN INTERIORUL PAGINII
        // Folosit împreună cu chrome.windows.update().
        // Nu depinde de requestFullscreen().
        // ==================================

        if (
            message.type ===
            "ENTER_PAGE_FULLSCREEN"
        ) {

            const player =
                getYouTubePlayer();


            if (!player) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit playerul YouTube."
                });

                return;
            }


            const success =
                enterPageFullscreen(
                    player
                );


            sendResponse({
                success,
                message:
                    success
                        ? "⛶ Player extins."
                        : "Nu am putut extinde playerul."
            });


            return;
        }


        // ==================================
        // REVENIREA PLAYERULUI LA NORMAL
        // ==================================

        if (
            message.type ===
            "EXIT_PAGE_FULLSCREEN"
        ) {

            const success =
                exitPageFullscreen();


            sendResponse({
                success: true,
                message:
                    success
                        ? "↩️ Player revenit la normal."
                        : "Playerul era deja în modul normal."
            });


            return;
        }


        // ==================================
        // FULLSCREEN
        // ==================================

        if (
            message.type ===
            "ENTER_FULLSCREEN"
        ) {

            const player =
                getYouTubePlayer();


            if (!player) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit playerul YouTube."
                });

                return;
            }


            // Încercăm mai întâi fullscreen-ul nativ.
            // Uneori Chrome îl poate refuza pentru că o
            // comandă vocală nu este considerată user gesture.
            if (
                !document.fullscreenElement &&
                player.requestFullscreen
            ) {

                player.requestFullscreen()
                    .then(
                        () => {

                            sendResponse({
                                success: true,
                                message:
                                    "⛶ Fullscreen activat."
                            });
                        }
                    )
                    .catch(
                        () => {

                            enterPageFullscreen(
                                player
                            );

                            sendResponse({
                                success: true,
                                message:
                                    "⛶ Ecran complet activat în pagină."
                            });
                        }
                    );


                return true;
            }


            // Dacă fullscreen-ul nativ nu este disponibil,
            // folosim fallback-ul din pagină.
            enterPageFullscreen(
                player
            );


            sendResponse({
                success: true,
                message:
                    "⛶ Ecran complet activat în pagină."
            });


            return;
        }


        // ==================================
        // IEȘIRE DIN FULLSCREEN
        // ==================================

        if (
            message.type ===
            "EXIT_FULLSCREEN"
        ) {

            // Eliminăm întotdeauna fallback-ul CSS.
            const pageFullscreenRemoved =
                exitPageFullscreen();


            // Dacă suntem în fullscreen nativ,
            // ieșim și de acolo.
            if (
                document.fullscreenElement &&
                document.exitFullscreen
            ) {

                document.exitFullscreen()
                    .then(
                        () => {

                            sendResponse({
                                success: true,
                                message:
                                    "↩️ Am ieșit din fullscreen."
                            });
                        }
                    )
                    .catch(
                        () => {

                            sendResponse({
                                success:
                                    pageFullscreenRemoved,

                                message:
                                    pageFullscreenRemoved
                                        ? "↩️ Am ieșit din ecran complet."
                                        : "Nu am putut ieși din fullscreen."
                            });
                        }
                    );


                return true;
            }


            sendResponse({
                success:
                    pageFullscreenRemoved,

                message:
                    pageFullscreenRemoved
                        ? "↩️ Am ieșit din ecran complet."
                        : "Videoclipul nu este în fullscreen."
            });


            return;
        }


        // ==================================
        // VOLUM MAI TARE
        // ==================================

        if (
            message.type ===
            "VOLUME_UP"
        ) {

            const video =
                getMainVideo();


            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }


            const step =
                Number(message.step || 10) /
                100;


            video.muted = false;

            video.volume =
                Math.min(
                    1,
                    video.volume + step
                );


            const percent =
                Math.round(
                    video.volume * 100
                );


            sendResponse({
                success: true,
                message:
                    "🔊 Volum: " +
                    percent +
                    "%"
            });


            return;
        }


        // ==================================
        // VOLUM MAI ÎNCET
        // ==================================

        if (
            message.type ===
            "VOLUME_DOWN"
        ) {

            const video =
                getMainVideo();


            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }


            const step =
                Number(message.step || 10) /
                100;


            video.volume =
                Math.max(
                    0,
                    video.volume - step
                );


            if (video.volume > 0) {
                video.muted = false;
            }


            const percent =
                Math.round(
                    video.volume * 100
                );


            sendResponse({
                success: true,
                message:
                    "🔉 Volum: " +
                    percent +
                    "%"
            });


            return;
        }


        // ==================================
        // SETEAZĂ VOLUM EXACT
        // ==================================

        if (
            message.type ===
            "SET_VOLUME"
        ) {

            const video =
                getMainVideo();


            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }


            const percent =
                Math.max(
                    0,
                    Math.min(
                        100,
                        Number(message.value)
                    )
                );


            video.volume =
                percent / 100;


            if (percent > 0) {
                video.muted = false;
            }


            sendResponse({
                success: true,
                message:
                    "🔊 Volum setat la " +
                    Math.round(percent) +
                    "%"
            });


            return;
        }


        // ==================================
        // MUTE
        // ==================================

        if (
            message.type ===
            "MUTE_VIDEO"
        ) {

            const video =
                getMainVideo();


            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }


            video.muted = true;


            sendResponse({
                success: true,
                message:
                    "🔇 Sunet oprit."
            });


            return;
        }


        // ==================================
        // UNMUTE
        // ==================================

        if (
            message.type ===
            "UNMUTE_VIDEO"
        ) {

            const video =
                getMainVideo();


            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }


            video.muted = false;


            // Dacă volumul era 0, îl punem la 10%
            // ca să se audă imediat.
            if (video.volume === 0) {
                video.volume = 0.1;
            }


            const percent =
                Math.round(
                    video.volume * 100
                );


            sendResponse({
                success: true,
                message:
                    "🔊 Sunet pornit. Volum: " +
                    percent +
                    "%"
            });


            return;
        }


        // ==================================
        // PAUZĂ
        // ==================================

        if (
            message.type ===
            "PAUSE_VIDEO"
        ) {

            const video =
                getMainVideo();

            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }

            video.pause();

            sendResponse({
                success: true,
                message:
                    "⏸ Videoclip pus pe pauză."
            });

            return;
        }


        // ==================================
        // PLAY / CONTINUĂ
        // ==================================

        if (
            message.type ===
            "PLAY_VIDEO"
        ) {

            const video =
                getMainVideo();

            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }

            video.play()
                .catch(
                    error => {
                        console.error(
                            "Play error:",
                            error
                        );
                    }
                );

            sendResponse({
                success: true,
                message:
                    "▶️ Videoclip pornit."
            });

            return;
        }


        // ==================================
        // STOP
        // ==================================

        if (
            message.type ===
            "STOP_VIDEO"
        ) {

            const video =
                getMainVideo();

            if (!video) {

                sendResponse({
                    success: false,
                    message:
                        "Nu am găsit videoclipul."
                });

                return;
            }

            video.pause();
            video.currentTime = 0;

            sendResponse({
                success: true,
                message:
                    "⏹ Videoclip oprit."
            });

            return;
        }
    }
);
