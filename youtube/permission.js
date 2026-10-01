const button = document.getElementById("allowButton");
const status = document.getElementById("status");

button.addEventListener("click", async () => {

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        status.textContent =
            "✅ Microfon permis! Poți închide această pagină.";

        stream.getTracks().forEach(track => track.stop());

    } catch (error) {

        console.error("Microphone error:", error);

        status.textContent =
            "❌ " + error.name + ": " + error.message;
    }

});