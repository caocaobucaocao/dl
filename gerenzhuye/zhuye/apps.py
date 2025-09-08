from django.apps import AppConfig


class ZhuyeConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'zhuye'

    def ready(self):
        from gerenzhuye.decorators import logger
        logger.debug(f'{self.name}init finnished')
