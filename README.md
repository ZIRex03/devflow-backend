# Бэкенд для системы управления IT-проектами
## Описание проекта
Этот репозиторий содержит серверную часть системы управления проектами, разработанную на Node.js с использованием Express и локальной базы данных MySQL. Бэкенд предоставляет REST API для:

* Аутентификации и авторизации пользователей

* Управления проектами и задачами

* Генерации отчетов

* Работы с пользовательскими профилями

Фронтенд часть проекта доступна в отдельном репозитории:
[devflow-frontend](https://github.com/ZIRex03/devflow-frontend)

## Основные функции API
* Аутентификация:

  * Базовая аутентификация по логину/паролю

  * Механизм "запомнить меня" через HTTP-only cookies

  * Сессионное управление

* Управление проектами:

  * CRUD операции для проектов

  * Назначение участников

  * Изменение статусов

* Управление задачами:

  * Канбан-доска с возможностью перемещения задач

  * Назначение исполнителей

* Отчетность:

  * Генерация PDF-отчетов

  * Хранение и выгрузка отчетов

* Профили пользователей:

  * Загрузка аватаров и обложек

## Технологический стек
* Сервер: Node.js + Express

* База данных: MySQL

* Аутентификация: Сессии + Cookies

* Хранение файлов: Локальная файловая система
