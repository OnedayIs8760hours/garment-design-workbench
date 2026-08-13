#target photoshop

/**
 * 读取当前选中文字图层的 Photoshop textItem.font 值并弹窗显示。
 * @returns {void}
 */
(function () {
    if (!app.documents.length) {
        alert("请先打开 PSD，并选中一个文字图层。");
        return;
    }

    var layer = app.activeDocument.activeLayer;
    if (!layer || layer.kind !== LayerKind.TEXT) {
        alert("当前图层不是文字图层。请选中使用目标字体的文字图层后重试。");
        return;
    }

    var text = layer.textItem;
    var lines = [
        "Photoshop textItem.font:",
        text.font,
        "",
        "Layer:",
        layer.name,
        "",
        "把上面的 textItem.font 填到 src/fontMap.json 的 photoshopFont。"
    ];

    alert(lines.join("\n"));
})();
