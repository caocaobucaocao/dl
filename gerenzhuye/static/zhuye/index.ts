// 等待DOM加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
  // 获取所有导航项，指定类型为HTMLDivElement
  const navItems: NodeListOf<HTMLDivElement> = document.querySelectorAll('.nav-item');

  // 为每个导航项添加点击事件
  navItems.forEach((item: HTMLDivElement) => {
    // 查找导航项中的链接，指定类型为HTMLAnchorElement | null
    const link: HTMLAnchorElement | null = item.querySelector('a');

    // 如果存在链接，添加点击事件
    if (link) {
      item.addEventListener('click', function(e: MouseEvent) {
        // 阻止事件冒泡
        e.stopPropagation();

        // 获取链接的目标URL
        const url: string | null = link.getAttribute('href');

        // 验证URL有效性并跳转
        if (url && url.trim() !== '' && url !== 'javascript:void(0);') {
          window.location.href = url;
        }
      });
    }
  });
  // 处理退出按钮的点击事件（补充退出功能的TypeScript实现）
  const exitItem: HTMLDivElement | null = document.getElementById('exit') as HTMLDivElement | null;
  const logoutForm: HTMLFormElement | null = document.getElementById('logoutForm') as HTMLFormElement | null;

  if (exitItem && logoutForm) {
    exitItem.addEventListener('click', function(e: MouseEvent) {
      e.stopPropagation();
      logoutForm.submit(); // 提交退出表单
    });
  }
});