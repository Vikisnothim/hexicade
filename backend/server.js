const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

/*
=========================================================
ONLINE ROOMS
=========================================================
*/

const rooms = new Map();

/*
Room structure:

rooms.set("ABC123", {
  players: {
    P1: {
      socketId: "...",
      name: "Vikram"
    },

    P2: {
      socketId: "...",
      name: "Friend"
    }
  },

  minutes: 5,

  state: null
});
*/

function generateRoomCode() {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code +=
      characters[
        Math.floor(
          Math.random() *
            characters.length
        )
      ];
  }

  if (rooms.has(code)) {
    return generateRoomCode();
  }

  return code;
}

function getPlayerRole(room, socketId) {
  if (
    room.players.P1 &&
    room.players.P1.socketId ===
      socketId
  ) {
    return "P1";
  }

  if (
    room.players.P2 &&
    room.players.P2.socketId ===
      socketId
  ) {
    return "P2";
  }

  return null;
}

/*
=========================================================
NORMAL HTTP TEST
=========================================================
*/

app.get("/", (req, res) => {
  res.send(
    "Hexicade multiplayer backend is running!"
  );
});

/*
=========================================================
BOT
=========================================================
*/

app.post(
  "/api/bot-action",
  (req, res) => {
    const {
      moves = [],
      barriers = [],
      botCurrentPath,
      humanCurrentPath,
      barriersRemaining = 0,
    } = req.body;

    /*
    Win immediately.
    */

    const winningMove =
      moves.find(
        (move) => move.isGoal
      );

    if (winningMove) {
      return res.json({
        type: "MOVE",
        move: winningMove.id,
      });
    }

    /*
    Score movements.
    */

    let bestMove = null;
    let bestMoveScore = -Infinity;

    for (const move of moves) {
      let score = 0;

      const improvement =
        botCurrentPath -
        move.botPath;

      score +=
        improvement * 220;

      score -=
        move.botPath * 60;

      if (move.isBacktrack) {
        score -= 1200;
      }

      score +=
        Math.random() * 2;

      if (
        score >
        bestMoveScore
      ) {
        bestMoveScore = score;
        bestMove = move;
      }
    }

    /*
    Score barricades.
    */

    let bestBarrier = null;
    let bestBarrierScore =
      -Infinity;

    for (const barrier of barriers) {
      const humanDamage =
        barrier.humanDamage;

      const botDamage =
        barrier.botDamage;

      let score =
        humanDamage * 300 -
        botDamage * 180;

      if (humanDamage <= 0) {
        score -= 1000;
      }

      if (
        humanCurrentPath <= 4
      ) {
        score +=
          humanDamage * 400;
      }

      if (
        humanCurrentPath <= 2
      ) {
        score +=
          humanDamage * 900;
      }

      if (
        humanCurrentPath <
        botCurrentPath
      ) {
        score +=
          humanDamage * 350;
      }

      if (
        barriersRemaining <= 2
      ) {
        score -= 100;
      }

      if (
        score >
        bestBarrierScore
      ) {
        bestBarrierScore =
          score;

        bestBarrier =
          barrier;
      }
    }

    /*
    Decide.
    */

    if (
      botCurrentPath <= 2 &&
      humanCurrentPath > 1 &&
      bestMove
    ) {
      return res.json({
        type: "MOVE",
        move: bestMove.id,
      });
    }

    if (
      humanCurrentPath <= 3 &&
      bestBarrier &&
      bestBarrier.humanDamage >
        0 &&
      barriersRemaining > 0
    ) {
      return res.json({
        type: "BARRIER",
        id: bestBarrier.id,
      });
    }

    if (
      bestBarrier &&
      bestBarrier.humanDamage >=
        2 &&
      barriersRemaining > 0
    ) {
      return res.json({
        type: "BARRIER",
        id: bestBarrier.id,
      });
    }

    if (
      bestBarrier &&
      bestBarrier.humanDamage >=
        1 &&
      bestBarrier.botDamage <=
        1 &&
      humanCurrentPath <=
        botCurrentPath + 1 &&
      barriersRemaining > 0
    ) {
      return res.json({
        type: "BARRIER",
        id: bestBarrier.id,
      });
    }

    return res.json({
      type: "MOVE",

      move:
        bestMove
          ? bestMove.id
          : null,
    });
  }
);

/*
=========================================================
SOCKET.IO
=========================================================
*/

io.on("connection", (socket) => {
  console.log(
    "Connected:",
    socket.id
  );

  /*
  =======================================
  CREATE ROOM
  =======================================
  */

  socket.on(
    "create-room",
    (
      {
        name,
        minutes,
      },
      callback
    ) => {
      const roomCode =
        generateRoomCode();

      rooms.set(roomCode, {
        players: {
          P1: {
            socketId:
              socket.id,

            name:
              name ||
              "Player 1",
          },

          P2: null,
        },

        minutes:
          Number(minutes) ||
          5,

        state: null,
      });

      socket.join(roomCode);

      callback({
        success: true,

        roomCode,

        role: "P1",
      });

      console.log(
        `${roomCode} created`
      );
    }
  );

  /*
  =======================================
  JOIN ROOM
  =======================================
  */

  socket.on(
    "join-room",
    (
      {
        roomCode,
        name,
      },
      callback
    ) => {
      const code =
        roomCode
          .trim()
          .toUpperCase();

      const room =
        rooms.get(code);

      if (!room) {
        return callback({
          success: false,
          message:
            "Room not found.",
        });
      }

      if (room.players.P2) {
        return callback({
          success: false,
          message:
            "This room is already full.",
        });
      }

      room.players.P2 = {
        socketId:
          socket.id,

        name:
          name ||
          "Player 2",
      };

      socket.join(code);

      callback({
        success: true,

        roomCode: code,

        role: "P2",
      });

      /*
      Tell BOTH players the game
      can begin.
      */

      io.to(code).emit(
        "room-ready",
        {
          roomCode:
            code,

          minutes:
            room.minutes,

          players:
            room.players,
        }
      );

      console.log(
        `${code} now has two players`
      );
    }
  );

  /*
  =======================================
  INITIALIZE ONLINE GAME

  Only Player 1 may initialize.
  =======================================
  */

  socket.on(
    "initialize-game",
    ({
      roomCode,
      state,
    }) => {
      const room =
        rooms.get(roomCode);

      if (!room) return;

      const role =
        getPlayerRole(
          room,
          socket.id
        );

      if (role !== "P1") {
        return;
      }

      if (room.state) {
        return;
      }

      const seconds =
        room.minutes * 60;

      room.state = {
        ...state,

        timeLeft: {
          P1: seconds,
          P2: seconds,
        },
      };

      io.to(roomCode).emit(
        "game-state",
        room.state
      );
    }
  );

  /*
  =======================================
  GAME ACTION

  The server verifies that only the
  player whose turn it is can submit
  the next state.
  =======================================
  */

  socket.on(
    "game-action",
    (
      {
        roomCode,
        state,
      },
      callback
    ) => {
      const room =
        rooms.get(roomCode);

      if (
        !room ||
        !room.state
      ) {
        return callback?.({
          success: false,
        });
      }

      const role =
        getPlayerRole(
          room,
          socket.id
        );

      if (
        role !==
        room.state.turn
      ) {
        return callback?.({
          success: false,

          message:
            "It is not your turn.",
        });
      }

      /*
      Do not trust the browser's
      timer value.

      Keep the server timer.
      */

      const serverTime =
        room.state.timeLeft;

      room.state = {
        ...state,

        timeLeft:
          serverTime,
      };

      io.to(roomCode).emit(
        "game-state",
        room.state
      );

      callback?.({
        success: true,
      });
    }
  );

  /*
  =======================================
  LEAVE ROOM
  =======================================
  */

  socket.on(
    "leave-room",
    ({
      roomCode,
    }) => {
      const room =
        rooms.get(roomCode);

      if (!room) return;

      socket.leave(roomCode);

      socket
        .to(roomCode)
        .emit(
          "player-left",
          {
            message:
              "The other player left the game.",
          }
        );

      rooms.delete(roomCode);
    }
  );

  /*
  =======================================
  DISCONNECT
  =======================================
  */

  socket.on(
    "disconnect",
    () => {
      console.log(
        "Disconnected:",
        socket.id
      );

      for (
        const [
          roomCode,
          room,
        ]
        of rooms
      ) {
        const role =
          getPlayerRole(
            room,
            socket.id
          );

        if (role) {
          socket
            .to(roomCode)
            .emit(
              "player-left",
              {
                message:
                  "The other player disconnected.",
              }
            );

          rooms.delete(
            roomCode
          );
        }
      }
    }
  );
});

/*
=========================================================
SERVER-CONTROLLED ONLINE CHESS CLOCK
=========================================================
*/

setInterval(() => {
  for (
    const [
      roomCode,
      room,
    ]
    of rooms
  ) {
    if (
      !room.state ||
      !room.players.P1 ||
      !room.players.P2 ||
      room.state.winner
    ) {
      continue;
    }

    const currentPlayer =
      room.state.turn;

    const oldTime =
      room.state.timeLeft[
        currentPlayer
      ];

    const newTime =
      Math.max(
        0,
        oldTime - 1
      );

    room.state.timeLeft[
      currentPlayer
    ] = newTime;

    if (newTime === 0) {
      room.state.winner =
        currentPlayer ===
        "P1"
          ? "P2"
          : "P1";
    }

    io.to(roomCode).emit(
      "game-state",
      room.state
    );
  }
}, 1000);

/*
=========================================================
START SERVER
=========================================================
*/

const PORT =
  process.env.PORT ||
  3000;

server.listen(
  PORT,
  () => {
    console.log(
      `Hexicade server running on port ${PORT}`
    );
  }
);