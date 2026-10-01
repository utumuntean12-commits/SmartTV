// ============================================================
// SIDE PANEL UI
//
// SpeechRecognition NU mai rulează aici.
// Side Panel-ul poate fi închis în fullscreen fără să oprească
// asistentul vocal.
// ============================================================

const startButton =
    document.getElementById(
        "startButton"
    );

const stopButton =
    document.getElementById(
        "stopButton"
    );

const clearButton =
    document.getElementById(
        "clearButton"
    );

const result =
    document.getElementById(
        "result"
    );

const status =
    document.getElementById(
        "status"
    );


function renderState(state) {

    if (!state) {
        return;
    }


    status.textContent =
        state.statusText ||
        "";


    result.textContent = "";


    const finalNode =
        document.createTextNode(
            state.finalText || ""
        );


    const interimNode =
        document.createElement(
            "span"
        );


    interimNode.className =
        "temporary";


    interimNode.textContent =
        state.interimText || "";


    result.appendChild(
        finalNode
    );


    result.appendChild(
        interimNode
    );


    if (
        !state.finalText &&
        !state.interimText
    ) {

        result.textContent =
            "Textul va apărea aici...";
    }


    startButton.disabled =
        Boolean(
            state.listening
        );


    stopButton.disabled =
        !state.listening;
}


async function refreshState() {

    try {

        const response =
            await chrome.runtime.sendMessage({
                target: "background",
                type: "UI_GET_STATE"
            });


        if (
            response &&
            response.state
        ) {

            renderState(
                response.state
            );
        }

    } catch (error) {

        console.error(
            "Nu am putut încărca starea:",
            error
        );
    }
}


startButton.addEventListener(
    "click",
    async () => {

        status.textContent =
            "🎤 Pornesc asistentul...";


        try {

            await chrome.runtime.sendMessage({
                target: "background",
                type: "UI_START_LISTENING"
            });

        } catch (error) {

            console.error(
                "Start error:",
                error
            );


            status.textContent =
                "Nu am putut porni asistentul.";
        }
    }
);


stopButton.addEventListener(
    "click",
    async () => {

        try {

            await chrome.runtime.sendMessage({
                target: "background",
                type: "UI_STOP_LISTENING"
            });

        } catch (error) {

            console.error(
                "Stop error:",
                error
            );
        }
    }
);


clearButton.addEventListener(
    "click",
    async () => {

        try {

            await chrome.runtime.sendMessage({
                target: "background",
                type: "UI_CLEAR_TRANSCRIPT"
            });

        } catch (error) {

            console.error(
                "Clear error:",
                error
            );
        }
    }
);


// Actualizări live de la service worker.
chrome.runtime.onMessage.addListener(
    message => {

        if (
            message &&
            message.target ===
            "sidepanel" &&
            message.type ===
            "ASSISTANT_STATE"
        ) {

            renderState(
                message.state
            );
        }
    }
);


// Când Side Panel-ul este redeschis după fullscreen,
// încărcăm transcriptul și starea existentă.
refreshState();
