"use strict";
console.log('this ts');
document.addEventListener('DOMContentLoaded', function () {
    // 确保DOM加载完成后再获取元素
    const avatarInput = document.querySelector('input[name="avatar"]');
    // 明确指定为HTMLImageElement类型
    const previewImg = document.querySelector('.current-avatar')
        || document.querySelector('.default-avatar');
    if (avatarInput && previewImg) {
        console.log('元素加载成功');
        avatarInput.addEventListener('change', function (e) {
            console.log('change事件触发');
            // 类型断言为HTMLInputElement以访问files属性
            const input = e.target;
            if (input.files && input.files[0]) {
                console.log('文件选中:', input.files[0]);
                const file = input.files[0];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        var _a;
                        console.log('文件读取完成');
                        // 确保result是字符串类型
                        previewImg.src = (_a = e.target) === null || _a === void 0 ? void 0 : _a.result;
                        previewImg.classList.remove('default-avatar');
                        previewImg.classList.add('current-avatar');
                    };
                    reader.onerror = function () {
                        console.error('文件读取错误');
                    };
                    reader.readAsDataURL(file);
                }
                else {
                    alert('请选择图片文件！');
                }
            }
        });
    }
    else {
        console.error('未找到头像输入框或预览图片元素');
    }
});
