from django import template

register=template.Library()
@register.filter
def addRandom(value):
   # 尝试将值转换为整数后加1
    try:
        return int(value) + 1
    except (ValueError, TypeError):
        # 如果转换失败，返回原始值或其他默认处理
        return value
