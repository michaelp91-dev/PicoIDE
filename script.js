document.addEventListener('DOMContentLoaded', () => {
    const VERSION = "1.3.0 (Recovery)";
    document.getElementById('version-footer').textContent = `Version ${VERSION}`;

    // UI Elements
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const recoveryContainer = document.getElementById('recoveryContainer');
    const filenameInput = document.getElementById('filenameInput');
    const recoverButton = document.getElementById('recoverButton');
    const fileContentContainer = document.getElementById('fileContentContainer');
    const fileContentDisplay = document.getElementById('fileContent');
    const fileNameHeader = document.getElementById('fileNameHeader');

    // State
    let device;
    const EOT_MARKER = '_--EOT--_';

    // USB Identifiers
    const PICO_VENDOR_ID = 0x2e8a;
    const ADAFRUIT_VENDOR_ID = 0x239a;

    if (!('usb' in navigator)) {
        statusDisplay.textContent = 'Error: WebUSB is not supported.';
        connectButton.disabled = true;
        return;
    }

    connectButton.addEventListener('click', async () => {
        if (device) await disconnect();
        else await connect();
    });

    recoverButton.addEventListener('click', () => {
        const filename = filenameInput.value;
        if (filename) {
            recoverFile(filename);
        } else {
            alert('Please enter a filename.');
        }
    });

    async function connect() {
        try {
            device = await navigator.usb.requestDevice({
                filters: [{ vendorId: PICO_VENDOR_ID }, { vendorId: ADAFRUIT_VENDOR_ID }]
            });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0); 
            await device.claimInterface(1);
            await setDTR(true);
            
            statusDisplay.textContent = 'Status: Connected! Enter a filename to recover.';
            connectButton.textContent = 'Disconnect';
            recoveryContainer.classList.remove('hidden');
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
            device = null;
        }
    }

    async function disconnect() {
        if (!device) return;
        try {
            await setDTR(false);
            await device.close();
        } catch (error) { console.error('Error during disconnect:', error); }
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = '1. Connect to Board';
        recoveryContainer.classList.add('hidden');
        fileContentContainer.classList.add('hidden');
    }
    
    async function setDTR(value) {
        await device.controlTransferOut({
            requestType: 'class', recipient: 'interface', request: 0x22,
            value: value ? 0x01 : 0x00, index: 0x00
        });
    }
    
    async function enterRawModeAndExecute(command) {
        if (!device) return;
        try {
            // Enter raw mode, send command, soft reboot, then wait for EOT
            await device.transferOut(2, new TextEncoder().encode('\x01'));
            await device.transferOut(2, new TextEncoder().encode(command + '\r\n'));
            await device.transferOut(2, new TextEncoder().encode('\x04'));
            await readUntilEOT();
        } catch (error) { statusDisplay.textContent = `Error: ${error.message}`; }
    }

    async function readUntilEOT() {
        let buffer = '';
        while (true) {
            try {
                const result = await device.transferIn(2, 4096);
                const text = new TextDecoder().decode(result.data);
                buffer += text;
                if (buffer.includes(EOT_MARKER)) {
                    const eotIndex = buffer.indexOf(EOT_MARKER);
                    const cleanData = buffer.substring(0, eotIndex);
                    handleFileResponse(cleanData);
                    return;
                }
            } catch (error) {
                if (!error.message.includes("timed out")) {
                    statusDisplay.textContent = `Error reading: ${error.message}`;
                    return;
                }
            }
        }
    }

    async function recoverFile(filename) {
        fileContentContainer.classList.remove('hidden');
        fileNameHeader.textContent = filename;
        fileContentDisplay.textContent = `Attempting to recover '${filename}'...`;
        
        // This robust command reads the file line-by-line with a small delay
        // to prevent the data loss issue you were seeing with Python files.
        const command = `
try:
    import time
    with open('${filename}', 'r') as f:
        for line in f:
            print(line, end='')
            time.sleep_ms(5)
except Exception as e:
    print('###ERROR###:' + str(e))
finally:
    print('${EOT_MARKER}')
`;
        await enterRawModeAndExecute(command);
    }
    
    function handleFileResponse(text) {
        const lastPromptIndex = text.lastIndexOf('>');
        const cleanText = lastPromptIndex !== -1 ? text.substring(lastPromptIndex + 1) : text;
        fileContentDisplay.textContent = cleanText.trim();
        statusDisplay.textContent = `Successfully recovered content.`;
    }
});
