const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const cookieParser = require('cookie-parser')
const mime = require('mime-types');
const fs = require('fs');

const pool = mysql.createPool({
  host: 'MySQL-8.2',
  user: 'root',
  password: '',
  database: 'DevFlow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cookieParser());

pool.getConnection()
  .then(connection => {
    console.log("Подключено к базе данных");
    connection.release();
  })
  .catch(err => {
    console.error("Ошибка подключения:", err);
  });

const PORT = 5000;

const storageAvatar = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads", 'avatars'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const storageBanner = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads", 'banners'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const storageTaskImage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads", 'tasks'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const storageReport = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads", 'reports'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const uploadReport = multer({ storage: storageReport });
const uploadAvatar = multer({ storage: storageAvatar })
const uploadBanners = multer({ storage: storageBanner })
const uploadTaskImage = multer({ storage: storageTaskImage })

saveReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { report_name, created_user, project_id } = req.body;
    if (!report_name || !created_user || !project_id) {
      return res.status(400).json({
        error: "Report name, user ID and project ID are required"
      });
    }

    const reportPath = path.join("/uploads", "reports", path.basename(req.file.path)).replace(/\\/g, "/");

    // Добавляем project_id и явно указываем текущую дату
    const [result] = await pool.query(
      `INSERT INTO Reports 
             (report_name, create_date, report_path, created_user, project_id) 
             VALUES (?, NOW(), ?, ?, ?)`,
      [report_name, reportPath, created_user, project_id]
    );

    res.json({
      id: result.insertId,
      report_name,
      report_path: reportPath,
      created_user,
      project_id,
      create_date: new Date()
    });
  } catch (err) {
    console.error("Report save error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

app.post('/uploadreport', uploadReport.single("reportfile"), saveReport);

//Загрузка аватаров
app.post("/uploadavatar", uploadAvatar.single("useravatar"), async (req, res) => {
  try {
    // 1. Проверяем, что файл загружен
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 2. Получаем ID из тела запроса
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // 3. Формируем корректный путь для БД (кросс-платформенный)
    const imagePath = path.join("/uploads", "avatars", path.basename(req.file.path)).replace(/\\/g, "/");

    // 4. Обновляем аватар в БД (используем промисы)
    const [updateResult] = await pool.query(
      "UPDATE Users SET icon = ? WHERE id = ?",
      [imagePath, id]
    );

    // 5. Получаем обновленные данные пользователя
    const [user] = await pool.query("SELECT * FROM Users WHERE id = ?", [id]);

    // 6. Отправляем успешный ответ
    res.json(user[0]);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/add/tasks", uploadTaskImage.single("image"), async (req, res) => {
  try {
    const { name, description, priority, status, start_date, end_date, project_id } = req.body;

    if (!name || !priority || !status || !start_date || !end_date || !project_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let imagePath = null;
    if (req.file) {
      imagePath = path.join("/uploads", "tasks", path.basename(req.file.path)).replace(/\\/g, "/");
    }
    else {
      imagePath = ''
    }

    const [result] = await pool.query(
      `INSERT INTO Tasks 
       (name, description, image, priority, status, start_date, end_date, project_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, imagePath, priority, status, start_date, end_date, project_id]
    );

    const [task] = await pool.query("SELECT * FROM Tasks WHERE id = ?", [result.insertId]);

    res.status(201).json(task[0]);
  } catch (err) {
    console.error("Error creating task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/edit/tasks/:id", uploadTaskImage.single("image"), async (req, res) => {
  try {
    const taskId = req.params.id;
    const { name, description, priority, status, start_date, end_date } = req.body;

    let imagePath = null;
    if (req.file) {
      imagePath = path.join("/uploads", "tasks", path.basename(req.file.path)).replace(/\\/g, "/");
    }

    // Сначала получаем текущие данные задачи
    const [currentTask] = await pool.query("SELECT * FROM Tasks WHERE id = ?", [taskId]);

    if (currentTask.length === 0) {
      return res.status(404).json({ error: "Задача не найдена" });
    }

    // Обновляем только те поля, которые были переданы
    const updatedTask = {
      name: name || currentTask[0].name,
      description: description || currentTask[0].description,
      priority: priority || currentTask[0].priority,
      status: status || currentTask[0].status,
      start_date: start_date || currentTask[0].start_date,
      end_date: end_date || currentTask[0].end_date,
      image: imagePath || currentTask[0].image
    };

    await pool.query(
      `UPDATE Tasks SET 
        name = ?, 
        description = ?, 
        image = ?, 
        priority = ?, 
        status = ?, 
        start_date = ?, 
        end_date = ? 
      WHERE id = ?`,
      [
        updatedTask.name,
        updatedTask.description,
        updatedTask.image,
        updatedTask.priority,
        updatedTask.status,
        updatedTask.start_date,
        updatedTask.end_date,
        taskId
      ]
    );

    const [task] = await pool.query("SELECT * FROM Tasks WHERE id = ?", [taskId]);
    res.status(200).json(task[0]);
  } catch (err) {
    console.error("Error updating task:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

//Загрузка баннеров
app.post("/uploadbanner", uploadBanners.single("userbanner"), async (req, res) => {
  try {
    // 1. Проверяем, что файл загружен
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 2. Получаем ID из тела запроса
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // 3. Формируем корректный путь для БД (кросс-платформенный)
    const imagePath = path.join("/uploads", "banners", path.basename(req.file.path)).replace(/\\/g, "/");

    // 4. Обновляем аватар в БД (используем промисы)
    const [updateResult] = await pool.query(
      "UPDATE Users SET banner = ? WHERE id = ?",
      [imagePath, id]
    );

    // 5. Получаем обновленные данные пользователя
    const [user] = await pool.query("SELECT * FROM Users WHERE id = ?", [id]);

    // 6. Отправляем успешный ответ
    res.json(user[0]);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/reports/:projectId', async (req, res) => {
  try {
    const [reports] = await pool.query(
      'SELECT * FROM Reports WHERE project_id = ?',
      [req.params.projectId]
    );
    res.json(reports);
  } catch (err) {
    console.error('Ошибка запроса отчетов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/technologies/:projectId', async (req, res) => {
  try {
    const [technologies] = await pool.query(
      `SELECT t.name 
            FROM Projects p
            JOIN Projects_Technologies pt ON p.id = pt.project_id
            JOIN Technologies t ON pt.technology_id = t.id
            WHERE p.id = ?`,
      [req.params.projectId]
    );
    res.json(technologies);
  } catch (err) {
    console.error('Ошибка запроса технологий проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/client/:projectId', async (req, res) => {
  try {
    const [client] = await pool.query(
      `SELECT CONCAT(c.surname, ' ', c.name, ' ', c.patronymic) AS client_name
        FROM Clients c
        JOIN Clients_Request cr ON cr.client_id = c.id
        JOIN Projects p on p.request_id = cr.id
        WHERE p.id = ?`,
      [req.params.projectId]
    );
    res.json(client[0]);
  } catch (err) {
    console.error('Ошибка запроса клиента проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/extraservice/:projectId', async (req, res) => {
  try {
    const [extraservice] = await pool.query(
      `SELECT es.name as extra_service_name
        FROM Extra_Services es
        JOIN Request_Extra_Services res ON es.id = res.service_id
        JOIN Projects p on p.request_id = res.request_id
        WHERE p.id = ?`,
      [req.params.projectId]
    );
    res.json(extraservice);
  } catch (err) {
    console.error('Ошибка запроса доп услуг проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/technologies', async (req, res) => {
  try {
    const [technologies] = await pool.query(
      `SELECT t.id, t.name as technology_name, t.description as technology_description, t.status as technology_status
        FROM Technologies t`
    );
    res.json(technologies);
  } catch (err) {
    console.error('Ошибка запроса технологий:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


app.get('/download-report', async (req, res) => {
  try {
    // Получаем полный путь из запроса
    const fullPath = req.query.filename;
    if (!fullPath) {
      return res.status(400).json({ error: "Filename parameter is required" });
    }

    // Извлекаем только имя файла из полного пути
    const filename = path.basename(fullPath);
    if (!filename) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    // Формируем полный путь к файлу на сервере
    const filePath = path.join(__dirname, 'uploads', 'reports', filename);

    // Проверяем существование файла
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Получаем информацию о файле
    const fileStat = fs.statSync(filePath);
    const fileSize = fileStat.size;
    const mimeType = mime.lookup(filename) || 'application/octet-stream';

    // Устанавливаем заголовки
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    // Отправляем файл потоком
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'File read error' });
      }
    });

    fileStream.pipe(res);

  } catch (err) {
    console.error('Error downloading file:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
});

app.get('/projects', async (req, res) => {
  try {
    const [projects] = await pool.query('SELECT * FROM Projects');
    res.json(projects);
  } catch (err) {
    console.error('Ошибка запроса проектов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/projects/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const [project] = await pool.query(
      'SELECT * FROM `Projects` WHERE id = ?',
      [projectId]
    );

    if (project.length === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.json(project[0]);
  } catch (err) {
    console.error('Ошибка запроса проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/user-tasks/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const [tasks] = await pool.query(`
            SELECT t.*, p.name as project_name 
            FROM Tasks t
            JOIN Tasks_Users ut ON t.id = ut.task_id
            LEFT JOIN Projects p ON t.project_id = p.id
            WHERE ut.user_id = ?
        `, [userId]);
    res.json(tasks);
  } catch (err) {
    console.error('Ошибка запроса задач пользователя:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/auth', async (req, res) => {
  try {
    const { userEmail, userPassword, rememberMe } = req.body;

    const [users] = await pool.query(
      'SELECT * FROM Users WHERE email = ? AND password = ?',
      [userEmail, userPassword]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    if (rememberMe) {
      res.cookie('userAuth', JSON.stringify({ email: userEmail }), {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
      });
    } else {
      res.cookie('userAuth', JSON.stringify({ email: userEmail }), {
        httpOnly: true,
        secure: false,
      });
    }

    res.json({ success: true, user: users[0] });
  } catch (err) {
    console.error('Ошибка авторизации:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/check-auth', async (req, res) => {
  try {
    // Проверяем наличие кук вообще
    if (!req.cookies) {
      return res.status(401).json({ error: 'Куки не поддерживаются' });
    }

    // Проверяем конкретную куку
    const userAuthCookie = req.cookies.userAuth;
    if (!userAuthCookie) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    // Дальнейшая обработка...
    const { email } = JSON.parse(userAuthCookie);
    const [users] = await pool.query('SELECT * FROM Users WHERE email = ?', [email]);

    if (users.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    res.json({ user: users[0] });
  } catch (err) {
    console.error('Ошибка в /check-auth:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('userAuth');
  res.json({ success: true });
});

// Получение задач по ID проекта
app.get('/projects/:projectId/tasks', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const [tasks] = await pool.query(
      'SELECT * FROM Tasks WHERE project_id = ?',
      [projectId]
    );
    res.json(tasks);
  } catch (err) {
    console.error('Ошибка запроса задач:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/projects/:projectId/team', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const [tasks] = await pool.query(
      'SELECT pu.project_id, us.id as `user_id`, us.name, us.surname, us.icon as `user_icon` FROM `Projects_Users` pu JOIN `Users` us on pu.user_id = us.id WHERE pu.project_id = ?',
      [projectId]
    );
    res.json(tasks);
  } catch (err) {
    console.error('Ошибка запроса команды проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

//Получение задач участника
app.get('/projects/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const [projects] = await pool.query(
      'SELECT * FROM `Projects` p JOIN Projects_Users pu ON p.id = pu.project_id WHERE pu.user_id = ?',
      [userId]
    );
    res.json(projects);
  } catch (err) {
    console.error('Ошибка запроса проектов участника:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/projects/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const { name, description, status, type } = req.body;

    // 1. Обновляем проект
    await pool.query(
      'UPDATE Projects SET name = ?, description = ?, status = ?, type = ? WHERE id = ?',
      [name, description, status, type, projectId]
    );

    // 2. Получаем только обновлённые данные проекта
    const [[updatedProject]] = await pool.query(
      'SELECT * FROM Projects WHERE id = ? LIMIT 1',
      [projectId]
    );

    if (!updatedProject) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    // 3. Возвращаем только данные проекта
    res.json(updatedProject);

  } catch (err) {
    console.error('Ошибка при обновлении проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Добавление проекта
app.post('/add/projects', async (req, res) => {
  try {
    const { name, description, type, start_date, end_date, status } = req.body;

    if (!name || !type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Необходимо заполнить все обязательные поля' });
    }

    const [result] = await pool.query(
      'INSERT INTO Projects (name, description, type, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description, type, start_date, end_date, status || 'В работе']
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Проект успешно создан'
    });
  } catch (err) {
    console.error('Ошибка при создании проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера при создании проекта' });
  }
});

// Добавление технологий к проекту
app.post('/add/project-technologies', async (req, res) => {
  try {
    const { project_id, technologies } = req.body;

    if (!project_id || !technologies || !Array.isArray(technologies)) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    // Создаем массив значений для пакетной вставки
    const values = technologies.map(tech_id => [project_id, tech_id]);

    // Выполняем пакетную вставку
    await pool.query(
      'INSERT INTO Projects_Technologies (project_id, technology_id) VALUES ?',
      [values]
    );

    res.status(201).json({
      message: 'Технологии успешно добавлены к проекту'
    });
  } catch (err) {
    console.error('Ошибка при добавлении технологий к проекту:', err);
    res.status(500).json({ error: 'Ошибка сервера при добавлении технологий' });
  }
});

app.delete('/delete/projects/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const [result] = await pool.query(
      'DELETE FROM Projects WHERE id = ?',
      [projectId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Проект не найден' });
    }

    res.status(200).json({ message: 'Проект успешно удален' });
  } catch (err) {
    console.error('Ошибка при удалении проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера при удалении проекта' });
  }
});

app.delete('/delete/task/:taskId', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const [result] = await pool.query(
      'DELETE FROM Tasks WHERE id = ?',
      [taskId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }

    res.status(200).json({ message: 'Задача успешно удалена' });
  } catch (err) {
    console.error('Ошибка при удалении задачи:', err);
    res.status(500).json({ error: 'Ошибка сервера при удалении задачи' });
  }
});

// Получение доступных пользователей
app.get('/projects/:projectId/available-users', async (req, res) => {
  try {
    const projectId = req.params.projectId;

    const [users] = await pool.query(`
      SELECT u.id, u.name, u.surname, u.icon, u.role 
      FROM Users u
      WHERE u.role != 'Manager' and u.role != 'Admin'
      AND u.id NOT IN (
        SELECT user_id FROM Projects_Users WHERE project_id = ?
      )
    `, [projectId]);

    res.json(users);
  } catch (err) {
    console.error('Error fetching available users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавление пользователей в проект
app.post('/projects/:projectId/add-users', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const { userIds, projectName } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Добавляем пользователей в проект
    const values = userIds.map(userId => [projectId, userId]);
    await pool.query(`
      INSERT INTO Projects_Users (project_id, user_id) 
      VALUES ?
    `, [values]);

    // Создаем уведомления для каждого добавленного пользователя
    const notificationValues = userIds.map(userId => [
      userId,
      `Вы были добавлены в проект ${projectName}`,
      'project',
      'false', // is_read
      new Date() // created_time
    ]);

    await pool.query(`
      INSERT INTO Notifications 
        (user_id, message, type, is_read, created_time) 
      VALUES ?
    `, [notificationValues]);

    res.json({ success: true, addedCount: userIds.length });
  } catch (err) {
    console.error('Error adding users to project:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/tasks/:taskId/users', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const [users] = await pool.query(
      'SELECT u.id, u.name as `user_name`, u.surname as `user_surname`, u.icon FROM Users u JOIN Tasks_Users tu ON u.id = tu.user_id WHERE tu.task_id = ?',
      [taskId]
    );
    res.json(users);
  } catch (err) {
    console.error('Ошибка запроса участников задачи:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

//Удаление участника из проекта

app.delete('/projects/:projectId/team/:userId', async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `DELETE FROM Tasks_Users
                WHERE user_id = ? 
                AND task_id IN (
                    SELECT id FROM Tasks WHERE project_id = ?
                )`,
        [userId, projectId]
      );

      await connection.query(
        'DELETE FROM Projects_Users WHERE project_id = ? AND user_id = ?',
        [projectId, userId]
      );

      const [team] = await connection.query(
        `SELECT pu.project_id, us.id as user_id, us.name, us.surname, us.icon as user_icon 
                FROM Projects_Users pu 
                JOIN Users us ON pu.user_id = us.id 
                WHERE pu.project_id = ?`,
        [projectId]
      );

      await connection.commit();
      res.json(team);
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Ошибка при удалении участника из проекта:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление всех пользователей из задачи
app.delete('/api/tasks/:taskId/users', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    await pool.query('DELETE FROM Tasks_Users WHERE task_id = ?', [taskId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error clearing task users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавление пользователей в задачу
app.post('/api/tasks/:taskId/users', async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const { userIds, projectId, projectName } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array is required' });
    }

    // Создаем массив значений для batch insert
    const values = userIds.map(userId => [taskId, userId]);

    await pool.query('INSERT INTO Tasks_Users (task_id, user_id) VALUES ?', [values]);

    // Создаем уведомления для каждого добавленного пользователя
    const notificationValues = userIds.map(userId => [
      userId,
      `Вам была назначена задача в проекте ${projectName}`,
      'task',
      'false', // is_read
      new Date() // created_time
    ]);

    await pool.query(`
      INSERT INTO Notifications 
        (user_id, message, type, is_read, created_time) 
      VALUES ?
    `, [notificationValues]);

    res.json({ success: true, addedCount: userIds.length });
  } catch (err) {
    console.error('Error adding users to task:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/users/top-by-tasks', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10);
    const [users] = await pool.query(`
      SELECT 
        u.id, 
        CONCAT(u.name, ' ', u.surname) AS full_name,
        COUNT(tu.task_id) AS task_count
      FROM Users u
      LEFT JOIN Tasks_Users tu ON u.id = tu.user_id
      LEFT JOIN Tasks t ON tu.task_id = t.id
      WHERE t.status != 'done' AND u.role != 'Manager' AND u.role != 'Admin'
      GROUP BY u.id
      ORDER BY task_count DESC
      LIMIT ?
    `, [limit]);

    res.json(users);
  } catch (err) {
    console.error('Ошибка запроса топ-пользователей:', err);
    res.status(500).json({ error: 'Ошибка сервера', details: err.message });
  }
});

app.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [notifications] = await pool.query(`
      SELECT * FROM Notifications 
      WHERE user_id = ? 
      ORDER BY created_time DESC
      LIMIT 50
    `, [userId]);

    res.json(notifications);
  } catch (err) {
    console.error('Ошибка получения уведомлений:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/notifications/mark-all-read/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    await pool.query(`
      UPDATE Notifications 
      SET is_read = 'true' 
      WHERE user_id = ? AND is_read = 'false'
    `, [userId]);

    const [notifications] = await pool.query(`
      SELECT * FROM Notifications 
      WHERE user_id = ? 
      ORDER BY created_time DESC
      LIMIT 50
    `, [userId]);

    res.json(notifications);
  } catch (err) {
    console.error('Ошибка отметки прочитанных уведомлений:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});