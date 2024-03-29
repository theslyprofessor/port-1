import net from 'net';
import { spawn } from 'child_process';
import { EventEmitter as event } from 'events';

class Port extends event {
	constructor(options) {
		super();
		this.setOptions(options);
	}

	setOptions(options) {
		this.options = {
			host: 'localhost',
			read: null,
			write: null,
			encoding: null,
			max: 1,
			basepath: '',
			pd: (('darwin' == process.platform)
				? '/Applications/Pd-0.54-1.app/Contents/Resources/bin/pd'
				: 'pd'),
			flags: {},
			...options
		};
		return this;
	}

	parseFlags(flags) {
		let array = [];
		let basepath = this.options.basepath || '';

		if (Array.isArray(flags)) return flags;
		for (let f in flags) {
			if (/debug|path|open/.test(f) || !flags[f]) continue;
			array.push(/^-/.test(f) ? f : '-' + f);
			if (typeof flags[f] != 'boolean') array.push(flags[f]);
		}

		let path = flags['-path'] || flags['path'] || '';

		if (basepath || path) {
			if (basepath && !(/\/$/.test(basepath))) basepath += '/';
			
			if (!Array.isArray(path)) array.push('-path', basepath + path);
			else path.forEach(p => array.push('-path', basepath + p));
		}

		array.push('-open', flags['-open'] || flags['open']);
		return array;
	}

	spawn() {
		if (this.options.debug) console.log(this.options.pd, this.parseFlags(this.options.flags));
		if (!this.options.pd) return this;
		let child = this.child = spawn(this.options.pd, this.parseFlags(this.options.flags));
		if (this.options.encoding) child.stderr.setEncoding(this.options.encoding);
		child.on('exit', this.emit.bind(this, 'exit'));
		child.stderr.on('data', this.emit.bind(this, 'stderr'));
		return this;
	}

	isRunning() {
		return (this.child && !this.child.killed && this.sender && this.sender.writable) || false;
	}

	connection(socket) {
		this.socket = socket;
		if (this.options.encoding) socket.setEncoding(this.options.encoding);
		socket.on('data', this.emit.bind(this, 'data'));
		this.emit('connection', socket);
	}

	listen() {
		let receiver = this.receiver = net.createServer();
		if (this.options.max) receiver.maxConnections = this.options.max;
		receiver.listen(this.options.read, this.options.host);
		receiver.on('listening', this.emit.bind(this, 'listening'));
		receiver.on('connection', this.connection.bind(this));
		receiver.on('error', this.emit.bind(this, 'error'));
	}

	connect() {
		let sender = this.sender = new net.Socket();
		if (this.options.encoding) sender.setEncoding(this.options.encoding);
		sender.on('connect', this.emit.bind(this, 'connect', sender));
		sender.on('error', this.emit.bind(this, 'error'));
		this.sender.connect(this.options.write, this.options.host);
	}

	write(data) {
		if (data != null) this.sender.write(data);
		return this;
	}

	create() {
		process.once('exit', this.destroy);
		if (this.options.write) this.on('connection', this.connect);
		if (!this.options.read) return this.spawn();
		this.on('listening', this.spawn);
		this.listen();
		return this;
	}

	destroy() {
		process.removeListener('exit', this.destroy);
		this.removeAllListeners('listening');
		this.removeAllListeners('connection');
		if (this.sender) {
			this.sender.destroy();
			this.sender.removeAllListeners('connect');
			this.sender.removeAllListeners('error');
			delete this.sender;
		}
		if (this.receiver) {
			this.receiver.close();
			this.receiver.removeAllListeners('listening');
			this.receiver.removeAllListeners('connection');
			this.receiver.removeAllListeners('error');
			delete this.receiver;
		}
		if (this.socket) this.socket.destroy();

		if (this.child) {
			this.child.stderr.removeAllListeners('data');
			this.child.kill();
		}
		this.emit('destroy');
		return this;
	}
}

export default Port;
