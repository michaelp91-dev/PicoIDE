    document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const fileListDisplay = document.getElementById('fileList');

    let device;
    // State management for responses
    let currentAction = null; 
    let fileToRead = '';
    
    const PICO_VENDOR_ID = 0x2e8a;
    const PICO_PRODUCT_ID = 0x0005;

    if (!('usb' in navigator)) {
        statusDisplay.textContent = 'Error: WebUSB is not supported by your browser.';
        connectButton.disabled = true;
        return;
    }

    connectButton.addEventListener('click', () => device ? disconnect() : connect());

    async function connect() {
        try {
            device = await navigator.usb.requestDevice({
                filters: [{ vendorId: PICO_VENDOR_ID, productId: PICO_PRODUCT_ID }]
            });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0); 
            await device.claimInterface(1);

            statusDisplay.textContent = 'Status: Connected';
            connectButton.textContent = 'Disconnect';
            fileListDisplay.innerHTML = '';
            await listFiles();
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
            device = null;
        }
    }

    async function disconnect() {
        if (!device) return;
        try {
            await device.releaseInterface(1);
            await device.releaseInterface(0);
            await device.close();
        } catch (error) {
            console.error('Error during disconnect:', error);
        }
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = 'Connect to Pico';
        fileListDisplay.innerHTML = '';
    }

    async function sendCommand(command) {
        const data = new TextEncoder().encode(command + '\r\n');
        await device.transferOut(2, data); 
    }

    async function listFiles() {
        currentAction = 'list';
        fileListDisplay.innerHTML = '<em>Fetching file list...</em>';
        const command = "import os; print(os.listdir())";
        await enterRawModeAndExecute(command);
    }

    async function readFile(filename) {
        currentAction = 'read';
        fileToRead = filename;
        statusDisplay.textContent = `Status: Reading '${filename}'...`;
        // Read file as binary and print its base64 representation for safe transfer
        const command = `
import ubinascii
try:
    with open('${filename}', 'rb') as f:
        d = f.read()
        print('B64_START:' + ubinascii.b2a_base64(d).decode('utf-8').strip() + ':B64_END')
except Exception as e:
    print('ERR:' + str(e))
`;
        await enterRawModeAndExecute(command);
    }
    
    async function enterRawModeAndExecute(command) {
        if (!device) return;
        try {
            await sendCommand('\x01'); // Ctrl+A: Enter raw mode
            await sendCommand(command);
            await sendCommand('\x04'); // Ctrl+D: Soft reboot to execute and get output
            setTimeout(readResponse, 300); // Increased timeout for file reads
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
        }
    }
    
    async function readResponse() {
        try {
            let result = await device.transferIn(2, 4096); // Increased buffer size for files
            let text = new TextDecoder().decode(result.data);

            if (currentAction === 'list') {
                handleListResponse(text);
            } else if (currentAction === 'read') {
                handleFileResponse(text);
            }
        } catch (error) {
            if (!error.message.includes("timed out")) {
                 statusDisplay.textContent = `Error reading response: ${error.message}`;
            }
        } finally {
            currentAction = null; // Reset action after handling
        }
    }

    function handleListResponse(text) {
        fileListDisplay.innerHTML = ''; // Clear loading message
        const fileArrayMatch = text.match(/\['.*?'\]/);
        if (fileArrayMatch) {
            const fileList = JSON.parse(fileArrayMatch[0].replace(/'/g, '"'));
            fileList.forEach(filename => {
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = filename;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    readFile(filename);
                });
                fileListDisplay.appendChild(link);
            });
        } else {
            fileListDisplay.textContent = "Could not parse file list.";
        }
        statusDisplay.textContent = 'Status: Connected';
    }

    function handleFileResponse(text) {
        if (text.includes('ERR:')) {
            statusDisplay.textContent = `Error reading file on Pico: ${text.split('ERR:')[1]}`;
            return;
        }
        const b64Match = text.match(/B64_START:(.*):B64_END/);
        if (b64Match) {
            const b64Data = b64Match[1];
            // Decode base64 and trigger download
            const binaryString = atob(b64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes]);
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileToRead;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            statusDisplay.textContent = `Status: Downloaded '${fileToRead}'`;
        } else {
            statusDisplay.textContent = `Error: Could not parse file content for '${fileToRead}'.`;
        }
    }
});
        
