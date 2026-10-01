// ============================================================
// OFFSCREEN VOICE ENGINE
//
// Acest document nu are UI.
// El continuă să existe chiar dacă Side Panel-ul este închis.
// Singurul API Chrome folosit aici este chrome.runtime,
// conform limitărilor Offscreen Document.
// ============================================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;


let recognition = null;

let shouldListen = false;

let restartTimer = null;

let isStarting = false;


// ------------------------------------------------------------
// Mesaj către service worker.
// ------------------------------------------------------------

function sendToBackground(
    type,
    data = {}
) {

    chrome.runtime.sendMessage({
        target:
            "background-from-offscreen",
        type,
        ...data
    }).catch(
        () => {
            // Service worker-ul poate fi recreat automat.
            // Mesajul următor îl va trezi din nou.
        }
    );
}


// ------------------------------------------------------------
// Inițializare SpeechRecognition.
// ------------------------------------------------------------

function ensureRecognition() {

    if (recognition) {
        return recognition;
    }


    if (!SpeechRecognition) {

        sendToBackground(
            "OFFSCREEN_ERROR",
            {
                error:
                    "speech-recognition-not-supported"
            }
        );

        return null;
    }


    recognition =
        new SpeechRecognition();


    recognition.lang =
        "ro-RO";


    recognition.continuous =
        true;


    recognition.interimResults =
        true;


    recognition.onstart =
        () => {

            isStarting = false;

            sendToBackground(
                "OFFSCREEN_STARTED"
            );
        };


    recognition.onresult =
        event => {

            let interimText = "";


            for (
                let i =
                    event.resultIndex;

                i <
                    event.results.length;

                i++
            ) {

                const transcript =
                    event.results[i][0]
                        .transcript;


                if (
                    event.results[i]
                        .isFinal
                ) {

                    sendToBackground(
                        "OFFSCREEN_FINAL",
                        {
                            text:
                                transcript
                        }
                    );

                } else {

                    interimText +=
                        transcript;
                }
            }


            sendToBackground(
                "OFFSCREEN_INTERIM",
                {
                    text:
                        interimText
                }
            );
        };


    recognition.onerror =
        event => {

            console.error(
                "Offscreen speech error:",
                event.error
            );


            if (
                event.error ===
                "not-allowed"
            ) {

                shouldListen =
                    false;
            }


            sendToBackground(
                "OFFSCREEN_ERROR",
                {
                    error:
                        event.error
                }
            );
        };


    recognition.onend =
        () => {

            isStarting = false;


            sendToBackground(
                "OFFSCREEN_STOPPED"
            );


            if (!shouldListen) {
                return;
            }


            clearTimeout(
                restartTimer
            );


            restartTimer =
                setTimeout(
                    () => {

                        startRecognition();

                    },
                    500
                );
        };


    return recognition;
}


// ------------------------------------------------------------
// Pornire.
// ------------------------------------------------------------

async function startRecognition() {

    shouldListen = true;


    const instance =
        ensureRecognition();


    if (!instance) {
        return;
    }


    if (isStarting) {
        return;
    }


    try {

        isStarting = true;


        // Verificăm că extensia are în continuare acces
        // la microfon. Stream-ul este închis imediat.
        const stream =
            await navigator.mediaDevices
                .getUserMedia({
                    audio: true
                });


        stream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );


        instance.start();

    } catch (error) {

        isStarting = false;


        shouldListen = false;


        console.error(
            "Offscreen microphone error:",
            error
        );


        sendToBackground(
            "OFFSCREEN_ERROR",
            {
                error:
                    error.name ||
                    "microphone-error"
            }
        );
    }
}


// ------------------------------------------------------------
// Oprire.
// ------------------------------------------------------------

function stopRecognition() {

    shouldListen = false;


    clearTimeout(
        restartTimer
    );


    restartTimer = null;


    if (!recognition) {

        sendToBackground(
            "OFFSCREEN_STOPPED"
        );

        return;
    }


    try {

        recognition.stop();

    } catch (error) {

        console.log(
            "Recognition was already stopped:",
            error
        );
    }
}


// ------------------------------------------------------------
// Mesaje primite de la service worker.
// ------------------------------------------------------------

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        if (
            !message ||
            message.target !==
            "offscreen"
        ) {

            return;
        }


        if (
            message.type ===
            "OFFSCREEN_START_LISTENING"
        ) {

            startRecognition()
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
            "OFFSCREEN_STOP_LISTENING"
        ) {

            stopRecognition();


            sendResponse({
                success: true
            });


            return;
        }
    }
);
