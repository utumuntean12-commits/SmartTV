// ============================================================
// VOICE ASSISTANT - SERVICE WORKER
//
// Responsabilități:
// 1. creează documentul offscreen pentru SpeechRecognition;
// 2. primește transcriptul de la offscreen.js;
// 3. interpretează comenzile vocale;
// 4. controlează tab-ul, fereastra Chrome și pagina YouTube;
// 5. închide Side Panel-ul la fullscreen;
// 6. păstrează starea UI în chrome.storage.session.
// ============================================================

const OFFSCREEN_DOCUMENT_PATH =
    "offscreen.html";


let creatingOffscreenDocument = null;


const DEFAULT_STATE = {
    listening: false,
    statusText:
        "Apasă „Pornește asistentul”.",
    finalText: "",
    interimText: "",
    previousWindowState: null
};


let assistantState = {
    ...DEFAULT_STATE
};


let stateLoaded = false;


// ------------------------------------------------------------
// Side Panel: click pe iconiță = toggle/open panel.
// ------------------------------------------------------------

chrome.sidePanel
    .setPanelBehavior({
        openPanelOnActionClick: true
    })
    .catch(
        error => {
            console.error(
                "Side panel behavior error:",
                error
            );
        }
    );


// ------------------------------------------------------------
// STARE
// ------------------------------------------------------------

async function loadState() {

    if (stateLoaded) {
        return assistantState;
    }


    const stored =
        await chrome.storage.session.get(
            "assistantState"
        );


    if (stored.assistantState) {

        assistantState = {
            ...DEFAULT_STATE,
            ...stored.assistantState,
            // textul intermediar nu trebuie păstrat
            // după recrearea contextului.
            interimText: ""
        };
    }


    stateLoaded = true;

    return assistantState;
}


async function persistState() {

    await chrome.storage.session.set({
        assistantState
    });
}


async function broadcastState() {

    // Dacă Side Panel-ul este închis, nu există receptor.
    // Este normal, deci ignorăm eroarea.
    try {

        await chrome.runtime.sendMessage({
            target: "sidepanel",
            type: "ASSISTANT_STATE",
            state: assistantState
        });

    } catch (error) {

        // no-op
    }
}


async function updateState(
    patch,
    persist = true
) {

    await loadState();

    assistantState = {
        ...assistantState,
        ...patch
    };


    if (persist) {
        await persistState();
    }


    await broadcastState();

    return assistantState;
}


function setStatus(text) {

    updateState({
        statusText: String(text)
    }).catch(console.error);
}


// Compatibilitate cu logica mutată din sidepanel.js.
// Codul vechi folosește status.textContent = "...".
const status = {};

Object.defineProperty(
    status,
    "textContent",
    {
        set(value) {
            setStatus(value);
        },

        get() {
            return assistantState.statusText;
        }
    }
);


// ------------------------------------------------------------
// OFFSCREEN DOCUMENT
// ------------------------------------------------------------

async function ensureOffscreenDocument() {

    const offscreenUrl =
        chrome.runtime.getURL(
            OFFSCREEN_DOCUMENT_PATH
        );


    const existingContexts =
        await chrome.runtime.getContexts({
            contextTypes: [
                "OFFSCREEN_DOCUMENT"
            ],
            documentUrls: [
                offscreenUrl
            ]
        });


    if (existingContexts.length > 0) {
        return;
    }


    if (creatingOffscreenDocument) {

        await creatingOffscreenDocument;

        return;
    }


    creatingOffscreenDocument =
        chrome.offscreen.createDocument({
            url:
                OFFSCREEN_DOCUMENT_PATH,

            reasons: [
                "USER_MEDIA"
            ],

            justification:
                "Recunoaștere vocală continuă pentru controlul hands-free al YouTube."
        });


    try {

        await creatingOffscreenDocument;

    } finally {

        creatingOffscreenDocument =
            null;
    }
}


async function startListening() {

    await loadState();


    try {

        await ensureOffscreenDocument();


        await updateState({
            listening: true,
            statusText:
                "🎤 Pornesc asistentul..."
        });


        await chrome.runtime.sendMessage({
            target: "offscreen",
            type: "OFFSCREEN_START_LISTENING"
        });


        return {
            success: true
        };

    } catch (error) {

        console.error(
            "Start listening error:",
            error
        );


        await updateState({
            listening: false,
            statusText:
                "Nu am putut porni recunoașterea vocală."
        });


        return {
            success: false,
            error: error.message
        };
    }
}


async function stopListening() {

    await loadState();


    try {

        const contexts =
            await chrome.runtime.getContexts({
                contextTypes: [
                    "OFFSCREEN_DOCUMENT"
                ],
                documentUrls: [
                    chrome.runtime.getURL(
                        OFFSCREEN_DOCUMENT_PATH
                    )
                ]
            });


        if (contexts.length > 0) {

            try {

                await chrome.runtime.sendMessage({
                    target: "offscreen",
                    type:
                        "OFFSCREEN_STOP_LISTENING"
                });

            } catch (error) {

                console.log(
                    "Offscreen stop message:",
                    error
                );
            }


            await chrome.offscreen.closeDocument();
        }

    } catch (error) {

        console.error(
            "Stop listening error:",
            error
        );
    }


    await updateState({
        listening: false,
        interimText: "",
        statusText:
            "Ascultarea a fost oprită."
    });


    return {
        success: true
    };
}


// ------------------------------------------------------------
// FULLSCREEN
//
// Side Panel-ul este închis înainte să facem fereastra Chrome
// fullscreen. SpeechRecognition continuă în offscreen.html.
// ------------------------------------------------------------

async function enterBrowserFullscreen() {

    try {

        const currentWindow =
            await chrome.windows.getCurrent();


        if (!currentWindow.id) {

            setStatus(
                "Nu am găsit fereastra Chrome."
            );

            return false;
        }


        const restoreState =
            currentWindow.state !== "fullscreen"
                ? (
                    currentWindow.state ||
                    "maximized"
                )
                : (
                    assistantState.previousWindowState ||
                    "maximized"
                );


        await updateState({
            previousWindowState:
                restoreState
        });


        const playerResult =
            await sendToYouTube({
                type:
                    "ENTER_PAGE_FULLSCREEN"
            });


        if (!playerResult) {
            return false;
        }


        // Ascundem UI-ul asistentului.
        // Motorul vocal NU se oprește, fiind în offscreen.html.
        try {

            await chrome.sidePanel.close({
                windowId:
                    currentWindow.id
            });

        } catch (error) {

            console.log(
                "Side Panel era deja închis sau nu a putut fi închis:",
                error
            );
        }


        await chrome.windows.update(
            currentWindow.id,
            {
                state: "fullscreen",
                focused: true
            }
        );


        setStatus(
            "⛶ Fullscreen activat."
        );


        return true;

    } catch (error) {

        console.error(
            "Fullscreen window error:",
            error
        );


        setStatus(
            "Nu am putut activa fullscreen."
        );


        return false;
    }
}


async function exitBrowserFullscreen() {

    try {

        const currentWindow =
            await chrome.windows.getCurrent();


        try {

            await sendToYouTube({
                type:
                    "EXIT_PAGE_FULLSCREEN"
            });

        } catch (error) {

            console.log(
                "Nu am putut reseta playerul:",
                error
            );
        }


        if (!currentWindow.id) {

            setStatus(
                "Nu am găsit fereastra Chrome."
            );

            return false;
        }


        await loadState();


        let restoreState =
            assistantState.previousWindowState ||
            "maximized";


        if (
            restoreState === "fullscreen" ||
            restoreState === "minimized"
        ) {

            restoreState =
                "maximized";
        }


        await chrome.windows.update(
            currentWindow.id,
            {
                state:
                    restoreState,
                focused:
                    true
            }
        );


        await updateState({
            previousWindowState:
                null,
            statusText:
                "↩️ Am ieșit din fullscreen."
        });


        // SidePanel.open() poate necesita un user gesture.
        // Nu îl forțăm aici. Asistentul vocal continuă să
        // funcționeze; utilizatorul poate apăsa iconița extensiei
        // pentru a afișa din nou interfața.

        return true;

    } catch (error) {

        console.error(
            "Exit fullscreen error:",
            error
        );


        setStatus(
            "Nu am putut ieși din fullscreen."
        );


        return false;
    }
}


// ==========================================
// OBȚINE FILA ACTIVĂ
// ==========================================

async function getActiveTab() {

    const tabs =
        await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

    return tabs[0];
}


// ==========================================
// NORMALIZARE TEXT
// ==========================================

function normalizeText(text) {

    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .trim();
}


// ==========================================
// TRIMITE COMANDĂ CĂTRE YOUTUBE
// ==========================================

async function sendToYouTube(message) {

    const tab =
        await getActiveTab();


    if (!tab) {

        status.textContent =
            "Nu am găsit fila activă.";

        return false;
    }


    if (
        !tab.url ||
        !tab.url.includes("youtube.com")
    ) {

        status.textContent =
            "Trebuie să fii pe YouTube.";

        return false;
    }


    try {

        const response =
            await chrome.tabs.sendMessage(
                tab.id,
                message
            );


        if (
            response &&
            response.message
        ) {

            status.textContent =
                response.message;
        }


        return true;

    } catch (error) {

        console.error(
            "Message error:",
            error
        );

        status.textContent =
            "Nu pot controla încă pagina YouTube.";

        return false;
    }
}


// ==========================================
// DESCHIDE YOUTUBE
// ==========================================

async function openYouTube() {

    const tab =
        await getActiveTab();


    if (!tab) {

        return;
    }


    status.textContent =
        "🌐 Deschid YouTube...";


    await chrome.tabs.update(
        tab.id,
        {
            url:
                "https://www.youtube.com/"
        }
    );
}



// ==========================================
// MERGI LA PAGINA PRINCIPALĂ YOUTUBE
// ==========================================

async function goToYouTubeHome() {

    const tab =
        await getActiveTab();


    if (!tab) {

        status.textContent =
            "Nu am găsit fila activă.";

        return;
    }


    if (
        !tab.url ||
        !tab.url.includes("youtube.com")
    ) {

        status.textContent =
            "Nu ești pe YouTube.";

        return;
    }


    status.textContent =
        "🏠 Merg la pagina principală YouTube...";


    await chrome.tabs.update(
        tab.id,
        {
            url:
                "https://www.youtube.com/"
        }
    );
}


// ==========================================
// ÎNAPOI - CA SĂGEATA DIN CHROME
// ==========================================

async function goBack() {

    const tab =
        await getActiveTab();


    if (!tab) {

        status.textContent =
            "Nu am găsit fila activă.";

        return;
    }


    status.textContent =
        "⬅️ Merg înapoi...";


    // Pe YouTube folosim mai întâi history.back()
    // direct în pagină. Este mai stabil pentru navigarea
    // internă de tip SPA a YouTube.
    if (
        tab.url &&
        tab.url.includes("youtube.com")
    ) {

        try {

            const response =
                await chrome.tabs.sendMessage(
                    tab.id,
                    {
                        type: "GO_BACK"
                    }
                );


            if (
                response &&
                response.success
            ) {

                status.textContent =
                    response.message ||
                    "⬅️ Merg înapoi...";

                return;
            }

        } catch (error) {

            console.log(
                "GO_BACK prin content script nu a reușit. Folosesc fallback.",
                error
            );
        }
    }


    // Fallback: comportamentul standard al filei Chrome.
    try {

        await chrome.tabs.goBack(
            tab.id
        );

        status.textContent =
            "⬅️ Am revenit la pagina anterioară.";

    } catch (error) {

        console.error(
            "Back error:",
            error
        );


        status.textContent =
            "Nu mai există o pagină anterioară.";
    }
}


// ==========================================
// CAUTĂ PE YOUTUBE
// ==========================================

async function searchYouTube(query) {

    const tab =
        await getActiveTab();


    if (!tab) {

        return;
    }


    if (
        !tab.url ||
        !tab.url.includes("youtube.com")
    ) {

        status.textContent =
            "Mai întâi spune «Deschide YouTube».";

        return;
    }


    const url =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);


    status.textContent =
        "🔎 Caut: " + query;


    await chrome.tabs.update(
        tab.id,
        {
            url: url
        }
    );
}


// ==========================================
// DETECTEAZĂ NUMĂRUL VIDEOCLIPULUI
// ==========================================

function getVideoNumber(command) {

    if (
        command.includes("videoclipul 1") ||
        command.includes("videoclipul unu") ||
        command.includes("primul videoclip")
    ) {

        return 1;
    }


    if (
        command.includes("videoclipul 2") ||
        command.includes("videoclipul doi") ||
        command.includes("al doilea videoclip")
    ) {

        return 2;
    }


    if (
        command.includes("videoclipul 3") ||
        command.includes("videoclipul trei") ||
        command.includes("al treilea videoclip")
    ) {

        return 3;
    }


    return null;
}



// ==========================================
// DETECTEAZĂ NUMĂRUL VIDEOCLIPULUI VIZIBIL
// Ex: "pune al doilea de pe ecran"
// ==========================================

function getVisibleVideoNumber(command) {

    const refersToScreen =
        command.includes("de pe ecran") ||
        command.includes("vizibil") ||
        command.includes("de pe pagina");

    if (!refersToScreen) {
        return null;
    }

    if (
        command.includes("primul") ||
        command.includes("unu") ||
        command.includes(" 1")
    ) {
        return 1;
    }

    if (
        command.includes("al doilea") ||
        command.includes("doi") ||
        command.includes(" 2")
    ) {
        return 2;
    }

    if (
        command.includes("al treilea") ||
        command.includes("trei") ||
        command.includes(" 3")
    ) {
        return 3;
    }

    if (
        command.includes("al patrulea") ||
        command.includes("patru") ||
        command.includes(" 4")
    ) {
        return 4;
    }

    if (
        command.includes("al cincilea") ||
        command.includes("cinci") ||
        command.includes(" 5")
    ) {
        return 5;
    }

    return null;
}


// ==========================================
// EXTRAGE TITLUL CERUT DINTR-O COMANDĂ "PUNE ..."
// ==========================================

function getRequestedVideoTitle(command) {

    if (!command.startsWith("pune ")) {
        return null;
    }

    let query =
        command.substring("pune ".length).trim();

    const removablePrefixes = [
        "melodia ",
        "muzica ",
        "piesa ",
        "videoclipul ",
        "videoclip ",
        "video "
    ];

    for (const prefix of removablePrefixes) {
        if (query.startsWith(prefix)) {
            query =
                query.substring(prefix.length).trim();
            break;
        }
    }

    return query || null;
}


// ==========================================
// DETECTEAZĂ UN PROCENT DE VOLUM
// Exemple:
// "volum 50"
// "volum la 50"
// "volumul la 30 la suta"
// "seteaza volumul la 80"
// ==========================================

function getVolumePercentage(command) {

    const match =
        command.match(
            /(?:seteaza\s+)?(?:volum|volumul)(?:\s+la)?\s+(\d{1,3})(?:\s+la\s+suta)?/
        );


    if (!match) {
        return null;
    }


    const value =
        Number(match[1]);


    if (Number.isNaN(value)) {
        return null;
    }


    return Math.max(
        0,
        Math.min(
            100,
            value
        )
    );
}


// ==========================================
// EXECUTĂ COMANDA VOCALĂ
// ==========================================

async function executeVoiceCommand(
    originalText
) {

    const command =
        normalizeText(originalText);


    console.log(
        "Comandă:",
        command
    );


    // ======================================
    // DESCHIDE YOUTUBE
    // ======================================

    if (
        command.includes(
            "deschide youtube"
        ) ||
        command.includes(
            "deschide you tube"
        )
    ) {

        await openYouTube();

        return true;
    }



    // ======================================
    // PAGINA PRINCIPALĂ YOUTUBE
    // ======================================

    if (
        command === "acasa" ||
        command === "pagina principala" ||
        command.includes(
            "mergi la pagina principala"
        ) ||
        command.includes(
            "du-ma la pagina principala"
        ) ||
        command.includes(
            "meniul principal"
        ) ||
        command.includes(
            "acasa pe youtube"
        )
    ) {

        await goToYouTubeHome();

        return true;
    }


    // ======================================
    // ÎNAPOI
    // ======================================

    if (
        command === "inapoi" ||
        command === "mergi inapoi" ||
        command === "du-te inapoi" ||
        command === "revino inapoi"
    ) {

        await goBack();

        return true;
    }


    // ======================================
    // CAUTĂ CEVA PE YOUTUBE
    // Ex:
    // "cauta esp32"
    // ======================================

    if (
        command.startsWith("cauta ")
    ) {

        let query =
            command.substring(
                "cauta ".length
            );


        // Permitem și:
        // "cauta pe youtube esp32"

        if (
            query.startsWith(
                "pe youtube "
            )
        ) {

            query =
                query.substring(
                    "pe youtube ".length
                );
        }


        if (
            query.startsWith(
                "youtube "
            )
        ) {

            query =
                query.substring(
                    "youtube ".length
                );
        }


        query =
            query.trim();


        if (query.length === 0) {

            status.textContent =
                "Ce vrei să caut?";

            return true;
        }


        await searchYouTube(
            query
        );


        return true;
    }



    // ======================================
    // SCROLL JOS / SUS
    // ======================================

    if (
        command === "scroll" ||
        command === "scroll jos" ||
        command === "deruleaza" ||
        command === "deruleaza jos" ||
        command === "mai jos"
    ) {

        await sendToYouTube({
            type: "SCROLL_PAGE",
            direction: "down"
        });

        return true;
    }


    if (
        command === "scroll sus" ||
        command === "deruleaza sus" ||
        command === "mai sus"
    ) {

        await sendToYouTube({
            type: "SCROLL_PAGE",
            direction: "up"
        });

        return true;
    }



    // ======================================
    // VOLUM EXACT
    // Ex: "volum 50", "volumul la 30"
    // ======================================

    const volumePercentage =
        getVolumePercentage(command);


    if (
        volumePercentage !== null
    ) {

        await sendToYouTube({
            type: "SET_VOLUME",
            value: volumePercentage
        });

        return true;
    }


    // ======================================
    // VOLUM MAI TARE
    // ======================================

    if (
        command === "volum mai tare" ||
        command === "mai tare" ||
        command === "da mai tare" ||
        command === "da volumul mai tare" ||
        command === "creste volumul" ||
        command === "volume up"
    ) {

        await sendToYouTube({
            type: "VOLUME_UP",
            step: 10
        });

        return true;
    }


    // ======================================
    // VOLUM MAI ÎNCET
    // ======================================

    if (
        command === "volum mai incet" ||
        command === "mai incet" ||
        command === "da mai incet" ||
        command === "da volumul mai incet" ||
        command === "scade volumul" ||
        command === "volume down"
    ) {

        await sendToYouTube({
            type: "VOLUME_DOWN",
            step: 10
        });

        return true;
    }


    // ======================================
    // MUTE
    // ======================================

    if (
        command === "mute" ||
        command === "fara sunet" ||
        command === "opreste sunetul" ||
        command === "dezactiveaza sunetul"
    ) {

        await sendToYouTube({
            type: "MUTE_VIDEO"
        });

        return true;
    }


    // ======================================
    // UNMUTE
    // ======================================

    if (
        command === "unmute" ||
        command === "un mute" ||
        command === "porneste sunetul" ||
        command === "activeaza sunetul" ||
        command === "da drumul la sunet" ||
        command === "cu sunet"
    ) {

        await sendToYouTube({
            type: "UNMUTE_VIDEO"
        });

        return true;
    }



    // ======================================
    // IEȘIRE DIN FULLSCREEN
    // ======================================

    if (
        command === "iesi din fullscreen" ||
        command === "iesi din full screen" ||
        command === "iesi din ecran complet" ||
        command === "revino din fullscreen" ||
        command === "inapoi din fullscreen" ||
        command === "inchide fullscreen" ||
        command === "inchide full screen"
    ) {

        await exitBrowserFullscreen();

        return true;
    }


    // ======================================
    // FULLSCREEN
    // ======================================

    if (
        command === "fullscreen" ||
        command === "full screen" ||
        command === "ecran complet" ||
        command === "pune fullscreen" ||
        command === "pune full screen" ||
        command === "pune pe ecran complet" ||
        command === "treci pe fullscreen" ||
        command === "treci pe ecran complet"
    ) {

        await enterBrowserFullscreen();

        return true;
    }


    // ======================================
    // ALEGE UN VIDEOCLIP DINTRE CELE VIZIBILE
    // Ex: "pune al doilea de pe ecran"
    // ======================================

    const visibleVideoNumber =
        getVisibleVideoNumber(command);

    if (visibleVideoNumber !== null) {

        await sendToYouTube({
            type: "PLAY_VISIBLE_VIDEO_BY_INDEX",
            index: visibleVideoNumber
        });

        return true;
    }


    // ======================================
    // ALEGE VIDEOCLIP
    // ======================================

    const videoNumber =
        getVideoNumber(command);


    if (
        videoNumber !== null
    ) {

        status.textContent =
            "▶️ Deschid videoclipul " +
            videoNumber;


        await sendToYouTube({

            type:
                "PLAY_VIDEO_BY_INDEX",

            index:
                videoNumber

        });


        return true;
    }


    // ======================================
    // PAUZĂ
    // ======================================

    if (
        command === "pauza" ||
        command.includes(
            "pune pauza"
        ) ||
        command.includes(
            "pauza videoclipul"
        )
    ) {

        await sendToYouTube({
            type: "PAUSE_VIDEO"
        });


        return true;
    }


    // ======================================
    // CONTINUĂ
    // ======================================

    if (
        command === "continua" ||
        command === "porneste" ||
        command.includes(
            "continua videoclipul"
        ) ||
        command.includes(
            "porneste videoclipul"
        )
    ) {

        await sendToYouTube({
            type: "PLAY_VIDEO"
        });


        return true;
    }


    // ======================================
    // STOP
    // ======================================

    if (
        command === "stop" ||
        command.includes(
            "opreste videoclipul"
        )
    ) {

        await sendToYouTube({
            type: "STOP_VIDEO"
        });


        return true;
    }



    // ======================================
    // PUNE VIDEOCLIPUL DUPĂ TITLUL PE CARE ÎL SPUI
    // Ex: "pune never gonna give you up"
    // ======================================

    const requestedTitle =
        getRequestedVideoTitle(command);

    if (
        requestedTitle &&
        requestedTitle !== "pauza"
    ) {

        await sendToYouTube({
            type: "PLAY_VIDEO_BY_TITLE",
            query: requestedTitle
        });

        return true;
    }


    return false;
}




// ============================================================
// TRANSCRIPT DE LA OFFSCREEN
// ============================================================

async function handleFinalTranscript(
    transcript
) {

    await loadState();


    const newFinalText =
        (
            assistantState.finalText +
            transcript +
            " "
        );


    await updateState({
        finalText:
            newFinalText,
        interimText:
            ""
    });


    const commandExecuted =
        await executeVoiceCommand(
            transcript
        );


    if (!commandExecuted) {

        await updateState({
            statusText:
                "🎤 Ascult..."
        });
    }
}


// ============================================================
// MESAJE
// ============================================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        if (!message) {
            return;
        }


        // Mesaje pentru Side Panel / Background.
        if (
            message.target === "background"
        ) {

            if (
                message.type ===
                "UI_GET_STATE"
            ) {

                loadState()
                    .then(
                        state => {
                            sendResponse({
                                success: true,
                                state
                            });
                        }
                    );

                return true;
            }


            if (
                message.type ===
                "UI_START_LISTENING"
            ) {

                startListening()
                    .then(sendResponse);

                return true;
            }


            if (
                message.type ===
                "UI_STOP_LISTENING"
            ) {

                stopListening()
                    .then(sendResponse);

                return true;
            }


            if (
                message.type ===
                "UI_CLEAR_TRANSCRIPT"
            ) {

                updateState({
                    finalText: "",
                    interimText: "",
                    statusText:
                        assistantState.listening
                            ? "🎤 Ascult..."
                            : "Textul a fost șters."
                })
                    .then(
                        () => {
                            sendResponse({
                                success: true
                            });
                        }
                    );

                return true;
            }
        }


        // Mesaje trimise de offscreen.js.
        if (
            message.target === "background-from-offscreen"
        ) {

            if (
                message.type ===
                "OFFSCREEN_STARTED"
            ) {

                updateState({
                    listening: true,
                    statusText:
                        "🎤 Ascult..."
                });

                sendResponse({
                    success: true
                });

                return;
            }


            if (
                message.type ===
                "OFFSCREEN_INTERIM"
            ) {

                updateState(
                    {
                        interimText:
                            message.text || ""
                    },
                    false
                );

                sendResponse({
                    success: true
                });

                return;
            }


            if (
                message.type ===
                "OFFSCREEN_FINAL"
            ) {

                handleFinalTranscript(
                    message.text || ""
                )
                    .then(
                        () => {
                            sendResponse({
                                success: true
                            });
                        }
                    );

                return true;
            }


            if (
                message.type ===
                "OFFSCREEN_ERROR"
            ) {

                const errorName =
                    message.error ||
                    "unknown";


                updateState({
                    listening:
                        errorName !==
                        "not-allowed",

                    statusText:
                        "Eroare speech recognition: " +
                        errorName
                });


                if (
                    errorName ===
                    "not-allowed"
                ) {

                    chrome.tabs.create({
                        url:
                            chrome.runtime.getURL(
                                "permission.html"
                            )
                    });
                }


                sendResponse({
                    success: true
                });

                return;
            }


            if (
                message.type ===
                "OFFSCREEN_STOPPED"
            ) {

                if (
                    !assistantState.listening
                ) {

                    updateState({
                        interimText: ""
                    });
                }


                sendResponse({
                    success: true
                });

                return;
            }
        }
    }
);


// La instalare/update, păstrăm comportamentul Side Panel.
chrome.runtime.onInstalled.addListener(
    () => {

        chrome.sidePanel
            .setPanelBehavior({
                openPanelOnActionClick:
                    true
            })
            .catch(console.error);
    }
);
