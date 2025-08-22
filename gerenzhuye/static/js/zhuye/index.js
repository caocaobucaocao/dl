"use strict";
// 等待DOM加载完成后再执行
document.addEventListener('DOMContentLoaded', function () {
    // 明确指定元素类型，可能为 null
    const exitElement = document.getElementById("exit");
    const logoutForm = document.getElementById("logoutForm");
    // 检查元素是否存在
    if (exitElement && logoutForm) {
        exitElement.addEventListener("click", function () {
            console.log("exit");
            // 调用表单的 submit 方法（类型安全，因为已确认是 HTMLFormElement）
            logoutForm.submit();
        });
    }
    else {
        console.log("未找到退出按钮或表单元素");
    }
});
