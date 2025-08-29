import logging
import functools
from datetime import datetime

# 获取zhuye日志器
logger = logging.getLogger('zhuye')

def log_execution(level=logging.INFO, include_args=True, include_result=True):
    """
    记录函数执行的装饰器
    
    参数:
        level: 日志级别
        include_args: 是否记录参数
        include_result: 是否记录返回值
    """
    def decorator(func):
        @functools.wraps(func)  # 保留原函数元信息
        def wrapper(*args, **kwargs):
            # 记录函数开始执行
            func_name = f"{func.__module__}.{func.__name__}"
            log_msg = [f"函数 {func_name} 开始执行"]
            
            # 记录参数（可选）
            if include_args:
                args_repr = [repr(a) for a in args]
                kwargs_repr = [f"{k}={v!r}" for k, v in kwargs.items()]
                args_str = ", ".join(args_repr + kwargs_repr)
                log_msg.append(f"参数: {args_str}")
            
            logger.log(level, " | ".join(log_msg))
            
            # 记录执行时间和结果
            start_time = datetime.now()
            try:
                result = func(*args, **kwargs)
                execution_time = (datetime.now() - start_time).total_seconds() * 1000  # 毫秒
                
                # 记录成功执行信息
                success_msg = [f"函数 {func_name} 执行成功", f"耗时: {execution_time:.2f}ms"]

                # 记录返回值（可选）
                if include_result:
                    success_msg.append(f"返回值: {result!r}")
                
                logger.log(level, " | ".join(success_msg))
                return result
                
            except Exception as e:
                # 记录异常信息
                execution_time = (datetime.now() - start_time).total_seconds() * 1000
                error_msg = [
                    f"函数 {func_name} 执行失败",
                    f"耗时: {execution_time:.2f}ms",
                    f"异常: {str(e)}"
                ]
                logger.error(" | ".join(error_msg), exc_info=True)  # 记录堆栈信息
                raise  # 重新抛出异常，不影响原有逻辑
        return wrapper
    return decorator
    