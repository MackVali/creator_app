export type NutritionBarcodeScannerResult =
  | { status: "scanned"; barcode: string }
  | { status: "cancelled"; barcode: null }
  | { status: "unavailable"; barcode: null; message: string }
  | { status: "denied"; barcode: null; message: string }
  | { status: "error"; barcode: null; message: string };

function getScannerErrorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.toLowerCase();
  }

  if (typeof error === "string") {
    return error.toLowerCase();
  }

  if (error && typeof error === "object") {
    const maybeError = error as { code?: unknown; message?: unknown };
    return [maybeError.code, maybeError.message]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
  }

  return "";
}

export async function scanNutritionBarcode(): Promise<NutritionBarcodeScannerResult> {
  if (typeof window === "undefined") {
    return {
      status: "unavailable",
      barcode: null,
      message: "Barcode scanning is available in the mobile app.",
    };
  }

  try {
    const { Capacitor } = await import("@capacitor/core");

    if (!Capacitor.isNativePlatform()) {
      return {
        status: "unavailable",
        barcode: null,
        message: "Barcode scanning is available in the mobile app. Use manual lookup here.",
      };
    }

    const {
      CapacitorBarcodeScanner,
      CapacitorBarcodeScannerAndroidScanningLibrary,
      CapacitorBarcodeScannerCameraDirection,
      CapacitorBarcodeScannerScanOrientation,
      CapacitorBarcodeScannerTypeHint,
    } = await import("@capacitor/barcode-scanner");

    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
      scanInstructions: "Align the barcode inside the frame.",
      android: {
        scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.ZXING,
      },
    });

    const barcode = result.ScanResult.trim();

    if (!barcode) {
      return {
        status: "cancelled",
        barcode: null,
      };
    }

    return {
      status: "scanned",
      barcode,
    };
  } catch (error) {
    const errorText = getScannerErrorText(error);

    if (errorText.includes("cancel") || errorText.includes("os-plug-barc-0006")) {
      return {
        status: "cancelled",
        barcode: null,
      };
    }

    if (
      errorText.includes("denied") ||
      errorText.includes("permission") ||
      errorText.includes("camera access") ||
      errorText.includes("os-plug-barc-0007")
    ) {
      return {
        status: "denied",
        barcode: null,
        message: "Camera permission is needed to scan. You can use manual lookup below.",
      };
    }

    return {
      status: "error",
      barcode: null,
      message: "Barcode scanner is unavailable right now. Use manual lookup below.",
    };
  }
}
