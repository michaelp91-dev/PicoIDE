document.addEventListener('DOMContentLoaded', () => {
    const VERSION = "1.1.2";
    document.getElementById('version-footer').textContent = `Version ${VERSION}`;

    // UI Elements
    const connectButton = document.getElementById('connectButton');
    const statusDisplay = document.getElementById('status');
    const fileListContainer = document.getElementById('fileListContainer');
    const fileListDisplay = document.getElementById('fileList');
    const fileContentContainer = document.getElementById('fileContentContainer');
    const fileContentDisplay = document.getElementById('fileContent');
    const fileNameHeader = document.getElementById('fileNameHeader');
    const backButton = document.getElementById('backButton');

    // State
    let device;
    let currentAction = null; 
    const EOT_MARKER = '_--EOT--_';

    // USB Identifiers
    const PICO_VENDOR_ID = 0x2e8a;
    const ADAFRUIT_VENDOR_ID = 0x239a;

    if (!('usb' in navigator)) {
        statusDisplay.textContent = 'Error: WebUSB is not supported by your browser.';
        connectButton.disabled = true;
        return;
    }

    connectButton.addEventListener('click', () => device ? disconnect() : connect());
    backButton.addEventListener('click', () => listFiles());

    async function connect() {
        try {
            device = await navigator.usb.requestDevice({
                filters: [
                    { vendorId: PICO_VENDOR_ID },
                    { vendorId: ADAFRUIT_VENDOR_ID }
                ]
            });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0); 
            await device.claimInterface(1);
            await setDTR(true);
            
            statusDisplay.textContent = 'Status: Connected';
            connectButton.textContent = 'Disconnect';
            await listFiles();
        } catch (error) {
            statusDisplay.textContent = `Error: ${error.message}`;
            device = null;
        }
    }

    async function disconnect() {
        if (!device) return;
        try {
            await setDTR(false);
            await device.releaseInterface(1);
            await device.releaseInterface(0);
            await device.close();
        } catch (error) { console.error('Error during disconnect:', error); }
        device = null;
        statusDisplay.textContent = 'Status: Disconnected';
        connectButton.textContent = 'Connect to Pico';
        fileListDisplay.innerHTML = '';
        showFileListView();
    }
    
    async function setDTR(value) {
        await device.controlTransferOut({
            requestType: 'class',
            recipient: 'interface',
            request: 0x22,
            value: value ? 0x01 : 0x00,
            index: 0x00
        });
    }

    async function sendCommand(command) {
        const data = new TextEncoder().encode(command + '\r\n');
        await device.transferOut(2, data); 
    }
    
    async function enterRawModeAndExecute(command) {
        if (!device) return;
        try {
            await sendCommand('\x01');
            await sendCommand(command);
            await sendCommand('\x04');
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
                    if (currentAction === 'list') {
                        handleListResponse(cleanData);
                    } else if (currentAction === 'read') {
                        handleFileResponse(cleanData);
                    }
                    return;
                }
            } catch (error) {
                if (!error.message.includes("timed out")) {
                    statusDisplay.textContent = `Error reading from Pico: ${error.message}`;
                    return;
                }
            }
        }
    }

    async function listFiles() {
        showFileListView();
        currentAction = 'list';
        fileListDisplay.innerHTML = '<em>Fetching file list...</em>';
        const command = `
try:
    import os, json
    print(json.dumps(os.listdir()))
except Exception as e:
    print(f'###ERROR###:{e}')
finally:
    print('${EOT_MARKER}')
`;
        await enterRawModeAndExecute(command);
    }

    async function readFile(filename) {
        showFileContentView();
        currentAction = 'read';
        fileNameHeader.textContent = filename;
        fileContentDisplay.textContent = `Reading '${filename}'...`;
        const command = `
try:
    with open('${filename}', 'r') as f:
        print(f.read())
except Exception as e:
    print('###ERROR###:' + str(e))
finally:
    print('${EOT_MARKER}')
`;
        await enterRawModeAndExecute(command);
    }
    
    // ##### SECTION CHANGED #####
    function handleListResponse(text) {
        fileListDisplay.innerHTML = '';
        
        // More robust cleaning: find the first '[' which marks the start of our JSON array.
        const jsonStartIndex = text.indexOf('[');
        if (jsonStartIndex === -1) {
            fileListDisplay.innerHTML = `<em>Error: No file array found in response. Raw data: ${text}</em>`;
            return;
        }
        
        let cleanText = text.substring(jsonStartIndex).trim();

        if (cleanText.startsWith('###ERROR###')) {
            const errorMessage = cleanText.split(':')[1];
            fileListDisplay.innerHTML = `<em>Error on Pico: ${errorMessage}</em>`;
            statusDisplay.textContent = 'Status: Error';
            return;
        }
        
        try {
            const files = JSON.parse(cleanText);
            if (files.length > 0) {
                files.forEach(filename => {
                    const link = document.createElement('a');
                    link.href = '#';
                    link.textContent = filename.trim();
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        readFile(filename.trim());
                    });
                    fileListDisplay.appendChild(link);
                });
            } else {
                fileListDisplay.innerHTML = '<em>No files found.</em>';
            }
        } catch (e) {
            fileListDisplay.innerHTML = `<em>Error parsing file list. Raw data: ${cleanText}</em>`;
        }
        statusDisplay.textContent = 'Status: Connected';
    }

    function handleFileResponse(text) {
        const lastPromptIndex = text.lastIndexOf('>');
        const cleanText = lastPromptIndex !== -1 ? text.substring(lastPromptIndex + 1) : text;
        fileContentDisplay.textContent = cleanText.trim();
        statusDisplay.textContent = 'Status: Displaying file content.';
    }

    function showFileListView() {
        fileContentContainer.classList.add('hidden');
        fileListContainer.classList.remove('hidden');
    }
    
    function showFileContentView() {
        fileListContainer.classList.add('hidden');
        fileContentContainer.classList.remove('hidden');
    }
});
