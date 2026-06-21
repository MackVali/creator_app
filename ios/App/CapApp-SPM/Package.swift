// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.0.2"),
        .package(name: "CapacitorCommunityContacts", path: "../../../node_modules/.pnpm/@capacitor-community+contacts@7.2.0_patch_hash=0070ac4700039d8be3aea6bc4fc55efbe9ca6925_deb1e30955b151b3051029b055be04da/node_modules/@capacitor-community/contacts"),
        .package(name: "CapacitorBarcodeScanner", path: "../../../node_modules/.pnpm/@capacitor+barcode-scanner@3.0.2_@capacitor+core@8.0.2/node_modules/@capacitor/barcode-scanner"),
        .package(name: "CapacitorCamera", path: "../../../node_modules/.pnpm/@capacitor+camera@8.2.0_@capacitor+core@8.0.2/node_modules/@capacitor/camera"),
        .package(name: "CapacitorHaptics", path: "../../../node_modules/.pnpm/@capacitor+haptics@8.0.2_@capacitor+core@8.0.2/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/.pnpm/@capacitor+push-notifications@8.1.1_@capacitor+core@8.0.2/node_modules/@capacitor/push-notifications"),
        .package(name: "RevenuecatPurchasesCapacitor", path: "../../../node_modules/.pnpm/@revenuecat+purchases-capacitor@12.1.1_@capacitor+core@8.0.2/node_modules/@revenuecat/purchases-capacitor")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityContacts", package: "CapacitorCommunityContacts"),
                .product(name: "CapacitorBarcodeScanner", package: "CapacitorBarcodeScanner"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "RevenuecatPurchasesCapacitor", package: "RevenuecatPurchasesCapacitor")
            ]
        )
    ]
)
