# Pico Web Explorer

A simple, client-side web application for viewing files on a Raspberry Pi Pico or other RP2040-based MicroPython board directly from an Android mobile device. This project runs entirely in the browser using the WebUSB API and is hosted on GitHub Pages.

## ⚠️ Current Status: Work in Progress ⚠️
> **Please Note:** This project is under active development and will likely not work yet. The code in this repository is experimental and for development purposes.



## Features

* **Browser-Based:** No native app installation required.
* **Mobile Optimized:** Designed for use on Android phones.
* **USB OTG Connection:** Connects directly to your microcontroller via a USB cable.
* **File Management:** List files and view their text content.
* **Broad Support:** Works with Raspberry Pi Pico, Adafruit ItsyBitsy RP2040, and other compatible boards.

## How It Works

This application leverages the **WebUSB API**, which allows web pages to communicate directly with USB devices. When you connect, the app sends commands to the MicroPython REPL (command line) on your board to list or read files and then displays the results. A crucial step is setting the DTR (Data Terminal Ready) signal, which is required by MicroPython boards to start communication.

## Requirements

### Hardware
* A supported microcontroller (e.g., Raspberry Pi Pico, Adafruit ItsyBitsy RP2040).
* An Android smartphone or tablet.
* A USB OTG (On-The-Go) adapter/cable.

### Software
* MicroPython firmware installed on your microcontroller.
* A WebUSB-compatible browser on your Android device (e.g., **Google Chrome**, **Microsoft Edge**).
    * *Note: This will not work on Firefox for Android or any browser on iOS/iPadOS due to lack of WebUSB support.*

## Usage

1.  Ensure your microcontroller is flashed with the standard MicroPython firmware.
2.  Connect your microcontroller to your Android device using the USB OTG adapter.
3.  Navigate to the project's GitHub Pages URL in a compatible browser.
4.  Tap the **Connect** button.
5.  A browser prompt will appear. Select your device (e.g., "Pico" or "ItsyBitsy") from the list and grant permission.
6.  The file list from your device should appear. Tap any file to view its content.

## License

This project is licensed under the MIT License.
