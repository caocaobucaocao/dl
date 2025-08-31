# zhuye/middleware.py
import json
import user_agents
from django.urls import reverse
from django.utils import timezone
from django.conf import settings

from gerenzhuye.decorators import logger
from ..models import SiteVisit


def get_real_ip(request):
    """获取用户真实IP（原有逻辑不变）"""
    ip_headers = ['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR']
    for header in ip_headers:
        ip = request.META.get(header)
        if ip:
            if header == 'HTTP_X_FORWARDED_FOR':
                ip = ip.split(',')[0].strip()
            return ip
    return '未知IP'


def filter_sensitive_params(param_dict):
    """
    过滤敏感参数（核心：避免存储密码、令牌等隐私信息）
    param_dict：原始参数字典
    返回：过滤后的参数字典
    """
    # 敏感参数列表（根据业务扩展，如密码、手机号、身份证等）
    sensitive_keys = [
        'password', 'passwd', 'pwd',  # 密码相关
        'token', 'session_id', 'cookie',  # 认证相关
        'phone', 'mobile', 'tel',  # 手机号相关
        'id_card', 'idcard', 'identity',  # 身份证相关
        'email', 'mail',  # 邮箱相关
        'bank_card', 'card_num',  # 银行卡相关
    ]

    # 遍历参数，过滤敏感字段（值替换为[已脱敏]）
    filtered_dict = {}
    for key, value in param_dict.items():
        if key.lower() in sensitive_keys:  # 不区分大小写（如 Password/PASSWORD 都过滤）
            filtered_dict[key] = '[已脱敏]'
        else:
            # 处理列表类型的参数（如多选框：?hobby=book&hobby=music）
            filtered_dict[key] = value if not isinstance(value, list) else [v for v in value]
    return filtered_dict


def get_request_params(request):
    """
    采集请求参数（GET/POST），并过滤敏感信息
    返回：字典格式的参数（或None）
    """
    params = {}

    # 1. 采集GET参数（URL中的参数，如 ?id=1&name=test）
    if request.GET:
        params['GET'] = filter_sensitive_params(dict(request.GET))

    # 2. 采集POST参数（表单/JSON数据）
    if request.method == 'POST':
        try:
            # 处理JSON格式的POST请求（如前后端分离场景）
            if 'application/json' in request.META.get('CONTENT_TYPE', ''):
                post_data = json.loads(request.body.decode('utf-8'))
                params['POST'] = filter_sensitive_params(post_data)
            # 处理表单格式的POST请求（如传统表单提交）
            else:
                params['POST'] = filter_sensitive_params(dict(request.POST))
        except Exception as e:
            # 捕获JSON解析异常（如非JSON格式的POST数据）
            if settings.DEBUG:
                print(f"解析POST参数失败：{str(e)}")
            params['POST'] = {'error': '解析POST参数失败'}

    # 若没有参数，返回None（避免存储空字典）
    return params if params else None


def record_visit(request, response):
    # 跳过不需要记录的请求
    # reverse('record_stay_duration')
    exclude_paths = [reverse('rgst'), reverse('login'), reverse('logout'), ]
    for e in ['/admin/', '/static/', '/media/', ]:
        exclude_paths.append(e)
    if any(request.path.startswith(path) for path in exclude_paths):
        return

    # --------------------------
    # 新增：采集请求参数（GET/POST，已过滤敏感信息）
    # --------------------------
    request_params = get_request_params(request)

    # --------------------------
    # 原有逻辑保持不变（访问时间、IP、User-Agent等）
    # --------------------------
    user_token = request.COOKIES.get('csrftoken')  # 对应前端设置的 cookie 键名
    visit_time = timezone.now()
    url = request.path
    referrer = request.META.get('HTTP_REFERER', '') or None
    ip_address = get_real_ip(request)
    user_agent_str = request.META.get('HTTP_USER_AGENT', '') or None

    # 解析User-Agent（原有逻辑）
    device_type = 'other'
    browser = None
    os = None
    if user_agent_str:
        user_agent = user_agents.parse(user_agent_str)
        if user_agent.is_mobile:
            device_type = 'mobile'
        elif user_agent.is_tablet:
            device_type = 'tablet'
        elif user_agent.is_pc:
            device_type = 'desktop'
        browser = f"{user_agent.browser.family} {user_agent.browser.version_string}"
        os = f"{user_agent.os.family} {user_agent.os.version_string}"

    # 计算访问时长（原有逻辑）
    duration = int((visit_time - request.start_time).total_seconds())
    duration = max(duration, 0)

    # 关联已登录用户（原有逻辑）
    user = request.user if request.user.is_authenticated else None

    # --------------------------
    # 保存数据（新增 params 字段）
    # --------------------------
    try:
        SiteVisit.objects.create(
            token=user_token,
            visit_time=visit_time,
            url=url,
            referrer=referrer,
            ip_address=ip_address,
            user_agent=user_agent_str,
            duration=duration,
            device_type=device_type,
            browser=browser,
            os=os,
            user=user,
            country=None,
            city=None,
            params=request_params  # 新增：存储过滤后的请求参数
        )
    except Exception as e:
        if settings.DEBUG:
            print(f"记录访问失败：{str(e)}")
        logger.error(f"自动记录访问失败：{str(e)}", exc_info=True)


class SiteVisitMiddleware:
    """自动记录用户访问的中间件（新增参数记录功能）"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.start_time = timezone.now()
        response = self.get_response(request)
        # 验证用户标识（登录用户或携带token的非登录用户）
        has_valid_identifier = False
        # 1. 登录用户：通过user标识
        if request.user.is_authenticated:
            has_valid_identifier = True

        # 2. 非登录用户：通过cookie中的anon_user_token标识
        else:
            user_token = request.COOKIES.get('csrftoken')
            if user_token:  # 确保token存在（非空）
                has_valid_identifier = True
        # 仅当有有效标识时，才记录访问
        if has_valid_identifier:
            record_visit(request, response)
        else:
            # 可选：记录无标识的访问尝试（用于调试）
            logger.debug(f"跳过无标识的访问记录：{request.path}")
        return response
