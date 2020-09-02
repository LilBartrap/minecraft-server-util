import assert from 'assert';
import net from 'net';

class Socket {
	public socket: net.Socket;
	public isConnected = false;
	private buffer: number[] = [];

	constructor(socket: net.Socket) {
		this.socket = socket;

		socket.on('data', (data) => {
			this.buffer.push(...Array.from(data));
		});
	}

	static connect(host: string, port: number, timeout: number): Promise<Socket> {
		assert(host.length > 0, 'Expected host.length > 0, got ' + host.length);
		assert(Number.isInteger(port), 'Expected integer, got ' + port);
		assert(port > 0, 'Expected port > 0, got ' + port);
		assert(port < 65536, 'Expected port < 65536, got ' + port);
		assert(timeout > 0, 'Expected timeout > 0, got ' + timeout);

		const socket = net.createConnection({ host, port, timeout });

		return new Promise((resolve, reject) => {
			socket.on('connect', () => {
				resolve(new Socket(socket));
			});

			socket.on('close', () => {
				reject();
			});

			socket.on('end', () => {
				reject();
			});

			socket.on('error', (error) => {
				reject(error);
			});

			socket.on('timeout', () => {
				reject();
			});
		});
	}

	readByte(): Promise<number> {
		if (this.buffer.length > 0) return Promise.resolve(this.buffer.shift() || 0);

		return new Promise((resolve) => {
			let read = false;

			this.socket.on('data', () => {
				if (read) return;

				process.nextTick(() => {
					if (this.buffer.length > 0) {
						read = true;

						return resolve(this.buffer.shift());
					}
				});
			});
		});
	}

	readBytes(length: number): Promise<number[]> {
		if (this.buffer.length >= length) {
			const value = this.buffer.slice(0, length);
			this.buffer.splice(0, length);
			return Promise.resolve(value);
		}

		return new Promise((resolve) => {
			let read = false;

			this.socket.on('data', () => {
				if (read) return;

				process.nextTick(() => {
					if (this.buffer.length >= length) {
						read = true;

						const value = this.buffer.slice(0, length);
						this.buffer.splice(0, length);
						return resolve(value);
					}
				});
			});
		});
	}

	writeByte(value: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket.write(Buffer.from([value]), (error) => {
				if (error) return reject(error);

				resolve();
			});
		});
	}

	writeBytes(buffer: Buffer): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket.write(buffer, (error) => {
				if (error) return reject(error);

				resolve();
			});
		});
	}

	async readVarInt(): Promise<number> {
		let numRead = 0;
		let result = 0;
		let read: number, value: number;

		do {
			if (numRead >= 5) throw new Error('VarInt exceeds data bounds');

			read = await this.readByte();
			value = (read & 0b01111111);
			result |= (value << (7 * numRead));

			numRead++;

			if (numRead > 5) {
				throw new Error('VarInt is too big');
			}
		} while ((read & 0b10000000) != 0);

		return result;
	}

	async readString(): Promise<string> {
		const length = await this.readVarInt();
		const data = await this.readBytes(length);

		let value = '';

		for (let i = 0; i < data.length; i++) {
			value += String.fromCharCode(data[i]);
		}

		return value;
	}

	destroy(): void {
		this.socket.removeAllListeners();
		this.socket.destroy();
	}
}

export default Socket;