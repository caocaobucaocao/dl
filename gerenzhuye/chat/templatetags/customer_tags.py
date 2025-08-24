# 在你的 app 下创建 templatetags 目录，结构如下：
# yourapp/
#   templatetags/
#     __init__.py
#     custom_tags.py

# custom_tags.py
import random
from django import template

register = template.Library()

@register.filter(name='random_number')
def random_num(value):
    """生成0到value之间的随机整数（包含value）"""
    try:
        max_val = int(value)
        return random.randint(0, max_val)
    except (ValueError, TypeError):
        return 0  # 异常时返回默认值