#target photoshop

/**
 * Restore changed order JSON panels into matching PSD smart objects.
 *
 * A panel is restored when its exported status is "completed" or it has
 * elements. The smart object name comes from panels.*.layerName in the order
 * JSON, falling back to panel name and then panel id.
 */
(function () {
    var CONFIG = {
        psdPath: "C:/Users/Woda/Desktop/M-4XL.psd",
        packageFolderPath: "E:/download/design-package-ORDER-20260805-001",
        packageJsonPath: "",
        pickPackageFolder: false,
        jsonShimPath: "S:/JSX/oneChangeToMuch/oneToMuch/JSON.jsx",
        restoreGroupName: "CODEX_ORDER_RESTORE"
    };
    var PANEL_LAYER_NAMES = {
        front: "\u524d\u7247",
        back: "\u540e\u7247",
        collar: "\u9886\u6761",
        "left-sleeve": "\u5de6\u8896",
        "left-sleeve-strip": "\u5de6\u8896\u6761",
        "right-sleeve": "\u53f3\u8896",
        "right-sleeve-strip": "\u53f3\u8896\u6761",
        shouder: "\u80a9\u7247",
        shoulder: "\u80a9\u7247"
    };

    main();

    function main() {
        var oldUnits = app.preferences.rulerUnits;
        var oldDialogs = app.displayDialogs;

        try {
            app.preferences.rulerUnits = Units.PIXELS;
            app.displayDialogs = DialogModes.NO;

            var orderFile = resolveOrderFile();
            if (!orderFile.exists) {
                throw new Error("Order JSON not found: " + orderFile.fsName);
            }

            var psdFile = new File(CONFIG.psdPath);
            if (!psdFile.exists) {
                throw new Error("PSD not found: " + psdFile.fsName);
            }

            var order = parseJsonFile(orderFile);
            var changedPanels = collectChangedPanels(order);
            if (!changedPanels.length) {
                throw new Error("No changed panels found in order JSON.");
            }

            var mainDoc = openOrActivateDocument(psdFile);
            var restoredPanels = [];
            var missingAssets = [];

            for (var i = 0; i < changedPanels.length; i++) {
                var item = changedPanels[i];
                var smartObjectNames = panelSmartObjectNames(item.panelId, item.panel);
                var smartLayer = findFirstSmartObjectLayer(mainDoc, smartObjectNames);

                if (!smartLayer) {
                    throw new Error(
                        "Smart object not found for panel " + item.panelId + ": " + smartObjectNames.join(", ") +
                        "\nAvailable smart objects:\n" + collectSmartObjectLayerNames(mainDoc).join("\n")
                    );
                }

                app.activeDocument = mainDoc;
                mainDoc.activeLayer = smartLayer;
                editSmartObjectContents();

                var smartDoc = app.activeDocument;
                var panelMissingAssets = restorePanelElements(smartDoc, order, item.panel, orderFile.parent);
                missingAssets = missingAssets.concat(prefixItems(panelMissingAssets, item.panelId + ": "));
                smartDoc.save();
                smartDoc.close(SaveOptions.SAVECHANGES);

                app.activeDocument = mainDoc;
                restoredPanels.push(item.panelId);
            }

            mainDoc.save();

            var message = "Restored panels: " + restoredPanels.join(", ") + "\nPSD: " + psdFile.fsName;
            if (missingAssets.length) {
                message += "\n\nMissing image assets skipped:\n" + unique(missingAssets).join("\n");
            }
            alert(message);
        } catch (error) {
            alert("Panel smart object restore failed:\n\n" + getErrorMessage(error));
        } finally {
            app.preferences.rulerUnits = oldUnits;
            app.displayDialogs = oldDialogs;
        }
    }

    function collectChangedPanels(order) {
        var result = [];
        if (!order || !order.panels) {
            return result;
        }

        var panelIds = order.panelOrder || objectKeys(order.panels);
        for (var i = 0; i < panelIds.length; i++) {
            var panelId = panelIds[i];
            var panel = order.panels[panelId];
            if (!panel || !panel.elements) {
                continue;
            }

            if (panel.changed === true || panel.status === "completed" || panel.elements.length > 0) {
                result.push({ panelId: panelId, panel: panel });
            }
        }

        return result;
    }

    function panelSmartObjectNames(panelId, panel) {
        return unique([
            panel.layerName,
            panel.name,
            PANEL_LAYER_NAMES[panelId],
            panelId
        ]);
    }

    function restorePanelElements(doc, order, panel, jsonFolder) {
        app.activeDocument = doc;

        removeLayerSetByName(doc, CONFIG.restoreGroupName);

        var group = doc.layerSets.add();
        group.name = CONFIG.restoreGroupName;

        var elements = panel.elements.slice(0).sort(function (a, b) {
            return Number(a.zIndex || 0) - Number(b.zIndex || 0);
        });

        var missingAssets = [];

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if (element.visible === false) {
                continue;
            }

            if (element.type === "text") {
                createTextLayer(doc, group, element);
            } else if (element.type === "image") {
                var asset = findAsset(order.assets || [], element.assetId);
                var assetFile = asset ? resolveAssetFile(jsonFolder, asset.sourceFile) : null;
                if (assetFile && assetFile.exists) {
                    createImageLayer(doc, group, element, assetFile);
                } else {
                    missingAssets.push(asset ? asset.sourceFile : element.assetId);
                }
            }
        }

        return missingAssets;
    }

    function createTextLayer(doc, group, element) {
        app.activeDocument = doc;

        var target = elementTargetRect(doc, element);
        var layer = doc.artLayers.add();
        layer.kind = LayerKind.TEXT;
        layer.name = "text " + String(element.text || "");

        var text = layer.textItem;
        text.contents = String(element.text || "");
        text.size = UnitValue(200, "px");
        text.position = [UnitValue(target.centerX, "px"), UnitValue(target.centerY, "px")];
        text.justification = Justification.CENTER;

        try {
            text.font = "Arial-BoldMT";
        } catch (ignoreFontError) {}

        text.color = solidColorFromHex(element.fill || "#000000");
        layer.opacity = percent(element.opacity == null ? 1 : element.opacity);

        fitLayerToRect(layer, target);

        if (element.rotation) {
            layer.rotate(Number(element.rotation), AnchorPosition.MIDDLECENTER);
        }

        applyStroke(layer, element.stroke || "#000000", Math.max(1, target.width * Number(element.strokeWidth || 0.01)));
        moveIntoGroup(layer, group);
    }

    function createImageLayer(doc, group, element, assetFile) {
        var imageDoc = null;
        app.activeDocument = doc;

        try {
            imageDoc = app.open(assetFile);
            imageDoc.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
        } finally {
            if (imageDoc) {
                imageDoc.close(SaveOptions.DONOTSAVECHANGES);
            }
        }

        app.activeDocument = doc;
        var layer = doc.activeLayer;
        layer.name = "image asset " + assetFile.name;
        layer.opacity = percent(element.opacity == null ? 1 : element.opacity);

        fitLayerToRect(layer, elementTargetRect(doc, element));

        if (element.rotation) {
            layer.rotate(Number(element.rotation), AnchorPosition.MIDDLECENTER);
        }

        moveIntoGroup(layer, group);
    }

    function elementTargetRect(doc, element) {
        var docWidth = toPixels(doc.width);
        var docHeight = toPixels(doc.height);
        var width = Number(element.width || 0) * docWidth;
        var height = Number(element.height || 0) * docHeight;
        var centerX = Number(element.centerX || 0) * docWidth;
        var centerY = Number(element.centerY || 0) * docHeight;

        return {
            width: width,
            height: height,
            centerX: centerX,
            centerY: centerY,
            left: centerX - width / 2,
            top: centerY - height / 2,
            right: centerX + width / 2,
            bottom: centerY + height / 2
        };
    }

    function fitLayerToRect(layer, target) {
        var bounds = readBounds(layer);
        var currentWidth = bounds.right - bounds.left;
        var currentHeight = bounds.bottom - bounds.top;

        if (currentWidth <= 0 || currentHeight <= 0) {
            throw new Error("Invalid layer bounds: " + layer.name);
        }

        layer.resize(
            (target.width / currentWidth) * 100,
            (target.height / currentHeight) * 100,
            AnchorPosition.MIDDLECENTER
        );

        bounds = readBounds(layer);
        var layerCenterX = (bounds.left + bounds.right) / 2;
        var layerCenterY = (bounds.top + bounds.bottom) / 2;
        layer.translate(
            UnitValue(target.centerX - layerCenterX, "px"),
            UnitValue(target.centerY - layerCenterY, "px")
        );
    }

    function findSmartObjectLayer(container, name) {
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.name === name && layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT) {
                return layer;
            }
            if (layer.typename === "LayerSet") {
                var found = findSmartObjectLayer(layer, name);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    function findFirstSmartObjectLayer(container, names) {
        for (var i = 0; i < names.length; i++) {
            var layer = findSmartObjectLayer(container, names[i]);
            if (layer) {
                return layer;
            }
        }

        return null;
    }

    function collectSmartObjectLayerNames(container) {
        var result = [];
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT) {
                result.push(layer.name);
            }
            if (layer.typename === "LayerSet") {
                result = result.concat(collectSmartObjectLayerNames(layer));
            }
        }

        return result;
    }

    function editSmartObjectContents() {
        executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
    }

    function openOrActivateDocument(file) {
        for (var i = 0; i < app.documents.length; i++) {
            var doc = app.documents[i];
            try {
                if (doc.fullName.fsName === file.fsName) {
                    app.activeDocument = doc;
                    return doc;
                }
            } catch (ignoreUnsavedDoc) {}
        }

        return app.open(file);
    }

    function parseJsonFile(file) {
        ensureJsonSupport();

        file.encoding = "UTF8";
        if (!file.open("r")) {
            throw new Error("Unable to read JSON: " + file.fsName);
        }

        var text;
        try {
            text = file.read();
        } finally {
            file.close();
        }

        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }

        return eval("(" + text + ")");
    }

    function ensureJsonSupport() {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return;
        }

        var shim = new File(CONFIG.jsonShimPath);
        if (shim.exists) {
            $.evalFile(shim);
        }
    }

    function resolveOrderFile() {
        var runtimeFolderPath = runtimePackageFolder();
        if (runtimeFolderPath) {
            return orderFileInFolder(runtimeFolderPath);
        }

        if (CONFIG.pickPackageFolder) {
            var selectedFolder = Folder.selectDialog("Select the extracted design package folder");
            if (selectedFolder) {
                return orderFileInFolder(selectedFolder.fsName);
            }
        }

        if (CONFIG.packageJsonPath) {
            return new File(CONFIG.packageJsonPath);
        }

        return orderFileInFolder(CONFIG.packageFolderPath);
    }

    function orderFileInFolder(folderPath) {
        if (!folderPath) {
            return new File("");
        }

        return firstExistingFile([
            folderPath + "/manifest.json",
            folderPath + "/order-design.json"
        ]);
    }

    function runtimePackageFolder() {
        try {
            return $.global.CODEX_PACKAGE_FOLDER || "";
        } catch (ignoreRuntimeFolder) {
            return "";
        }
    }

    function firstExistingFile(paths) {
        for (var i = 0; i < paths.length; i++) {
            var file = new File(paths[i]);
            if (file.exists) {
                return file;
            }
        }

        return new File(paths[0]);
    }

    function resolveAssetFile(jsonFolder, sourceFile) {
        if (!sourceFile) {
            return null;
        }

        var candidates = [
            new File(jsonFolder.fsName + "/assets/" + sourceFile),
            new File(jsonFolder.fsName + "/" + sourceFile),
            new File("E:/download/assets/" + sourceFile),
            new File("E:/download/" + sourceFile),
            new File("C:/Users/Woda/Downloads/" + sourceFile),
            new File("C:/Users/Woda/Desktop/" + sourceFile)
        ];

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].exists) {
                return candidates[i];
            }
        }

        return null;
    }

    function findAsset(assets, assetId) {
        for (var i = 0; i < assets.length; i++) {
            if (assets[i].assetId === assetId) {
                return assets[i];
            }
        }

        return null;
    }

    function removeLayerSetByName(doc, name) {
        for (var i = doc.layerSets.length - 1; i >= 0; i--) {
            if (doc.layerSets[i].name === name) {
                doc.layerSets[i].remove();
            }
        }
    }

    function moveIntoGroup(layer, group) {
        try {
            layer.move(group, ElementPlacement.INSIDE);
        } catch (ignoreMoveError) {}
    }

    function readBounds(layer) {
        var b = layer.bounds;
        return {
            left: toPixels(b[0]),
            top: toPixels(b[1]),
            right: toPixels(b[2]),
            bottom: toPixels(b[3])
        };
    }

    function toPixels(value) {
        try {
            return Number(value.as("px"));
        } catch (error) {
            return Number(value.value);
        }
    }

    function percent(value) {
        return Math.max(0, Math.min(100, Number(value) * 100));
    }

    function solidColorFromHex(hex) {
        var text = String(hex || "#000000").replace("#", "");
        if (text.length === 3) {
            text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
        }

        var color = new SolidColor();
        color.rgb.red = parseInt(text.substring(0, 2), 16);
        color.rgb.green = parseInt(text.substring(2, 4), 16);
        color.rgb.blue = parseInt(text.substring(4, 6), 16);
        return color;
    }

    function applyStroke(layer, hex, sizePx) {
        app.activeDocument.activeLayer = layer;

        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("Lefx"));
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        var effects = new ActionDescriptor();
        effects.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 100);

        var stroke = new ActionDescriptor();
        stroke.putBoolean(charIDToTypeID("enab"), true);
        stroke.putEnumerated(charIDToTypeID("Styl"), charIDToTypeID("FStl"), charIDToTypeID("OutF"));
        stroke.putEnumerated(charIDToTypeID("PntT"), charIDToTypeID("FrFl"), charIDToTypeID("SClr"));
        stroke.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        stroke.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100);
        stroke.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), sizePx);

        var color = solidColorFromHex(hex);
        var colorDesc = new ActionDescriptor();
        colorDesc.putDouble(charIDToTypeID("Rd  "), color.rgb.red);
        colorDesc.putDouble(charIDToTypeID("Grn "), color.rgb.green);
        colorDesc.putDouble(charIDToTypeID("Bl  "), color.rgb.blue);
        stroke.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), colorDesc);

        effects.putObject(charIDToTypeID("FrFX"), charIDToTypeID("FrFX"), stroke);
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), effects);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    }

    function objectKeys(object) {
        var result = [];
        for (var key in object) {
            if (object.hasOwnProperty(key)) {
                result.push(key);
            }
        }
        return result;
    }

    function prefixItems(items, prefix) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            result.push(prefix + items[i]);
        }
        return result;
    }

    function unique(items) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i] && result.join("\n").indexOf(items[i]) === -1) {
                result.push(items[i]);
            }
        }
        return result;
    }

    function getErrorMessage(error) {
        var message = error && error.message ? error.message : String(error);
        if (error && error.line) {
            message += "\nScript line: " + error.line;
        }
        return message;
    }
})();
