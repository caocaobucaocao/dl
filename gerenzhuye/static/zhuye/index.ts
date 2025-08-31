// 等待DOM加载完成后执行
// 页面加载时记录开始时间

// 从Cookie获取CSRF令牌（带类型定义）
function getCsrfToken(): string | null {
    console.log('getCsrfToken()');
    let cookieValue: string | null = null;

    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');

        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();

            // 查找csrftoken cookie（精确匹配名称可通过Django的CSRF_COOKIE_NAME配置修改）
            if (cookie.substring(0, 10) === 'csrftoken=') {
                cookieValue = decodeURIComponent(cookie.substring(10));
                break;
            }
        }
    }
    console.log('getCsrfToken()', cookieValue);
    return cookieValue;
}

document.addEventListener('DOMContentLoaded', function () {
    // 获取所有导航项
    console.log('index DOMContentLoaded');
    const startTime = new Date().getTime();

    const navItems: NodeListOf<HTMLDivElement> = document.querySelectorAll('.nav-item');
    // 获取当前页面的URL路径（例如：当前页面是https://xxx.com/home，则pathname是"/home"）
    const currentPath = window.location.pathname;
    // window.addEventListener('beforeunload', function () {
    //     const endTime = new Date().getTime();
    //     const stayDuration = Math.floor((endTime - startTime) / 1000); // 秒
    //     // 获取CSRF令牌
    //     const csrfToken: string | null = getCsrfToken();
    //     if (!csrfToken) {
    //         console.error('未找到CSRF令牌，请求中断');
    //         return;
    //     }
    //     console.log("csrfToken", csrfToken)
    //     // 发送AJAX请求到后端记录时长
    //     fetch("http://127.0.0.1:8000/zhuye/record_stay_duration/", {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //             'X-CSRFToken': csrfToken
    //         },
    //         body: JSON.stringify({
    //             duration: stayDuration,
    //             url: window.location.pathname
    //         }),
    //         keepalive: true
    //     }).then(r => console.log(r)).catch(error => console.error('fetch错误:', error));
    // });

    // 1. 页面加载时，根据当前URL自动激活对应的导航项
    function setActiveByUrl() {
        navItems.forEach(item => {
            const link = item.querySelector('a');
            if (link) {
                // 获取链接的href（可能是相对路径如"/home"或绝对路径）
                const linkHref = link.getAttribute('href') || '';
                // 处理链接路径（提取相对路径部分，避免域名干扰）
                const linkPath = new URL(linkHref, window.location.origin).pathname;

                // 如果链接路径与当前页面路径匹配，激活该导航项
                if (linkPath === currentPath) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            }
        });

        // 特殊处理退出项（如果退出后有单独页面，可根据URL匹配）
        const exitItem = document.getElementById('exit') as HTMLDivElement | null;
        if (exitItem) {
            // 假设退出后跳转的URL是"/logout"，根据实际情况修改
            if (currentPath === '/logout') {
                exitItem.classList.add('active');
            } else {
                exitItem.classList.remove('active');
            }
        }
    }

    // 初始加载时执行，确保页面刷新/跳转后能正确激活
    setActiveByUrl();

    // 2. 处理导航项点击事件
    navItems.forEach((item: HTMLDivElement) => {
        const link: HTMLAnchorElement | null = item.querySelector('a');
        if (link) {
            item.addEventListener('click', function (e: MouseEvent) {
                e.stopPropagation();

                // 点击时先手动激活当前项（优化视觉体验）
                navItems.forEach(navItem => navItem.classList.remove('active'));
                item.classList.add('active');

                // 跳转逻辑
                const url: string | null = link.getAttribute('href');
                if (url && url.trim() !== '' && url !== 'javascript:void(0);') {
                    window.location.href = url;
                }
            });
        }
    });

    // 3. 处理退出按钮点击事件
    const exitItem: HTMLDivElement | null = document.getElementById('exit') as HTMLDivElement | null;
    const logoutForm: HTMLFormElement | null = document.getElementById('logoutForm') as HTMLFormElement | null;

    if (exitItem && logoutForm) {
        exitItem.addEventListener('click', function (e: MouseEvent) {
            e.stopPropagation();
            navItems.forEach(navItem => navItem.classList.remove('active'));
            exitItem.classList.add('active');
            logoutForm.submit();
        });
    }
});
